using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace SoulFlame.ZorbasBridge;

internal sealed class NetworkPrinterService
{
    private const float PrinterDpi = 203f;
    private const int MarginPixels = 14;
    private const int RasterStripeHeight = 256;

    public async Task PrintReceiptAsync(
        string host,
        int port,
        ReceiptDocument receipt,
        string documentName,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("Липсва IP адрес за Print 2.");
        if (port is <= 0 or > 65535)
            throw new InvalidOperationException("Невалиден порт за Print 2.");

        using var bitmap = RenderReceipt(receipt);
        var payload = BuildEscPosPayload(bitmap);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(12));

        var outputMayExist = false;
        try
        {
            using var client = new TcpClient { NoDelay = true };
            await client.ConnectAsync(host, port, timeout.Token).ConfigureAwait(false);
            await using var stream = client.GetStream();

            // From this point on a partial TCP write can already have reached the printer.
            // Any later failure is physically ambiguous and must not be auto-retried.
            outputMayExist = true;
            await stream.WriteAsync(payload, timeout.Token).ConfigureAwait(false);
            await stream.FlushAsync(timeout.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            throw new PrinterDeliveryException(
                outputMayExist
                    ? "LAN печатът прекъсна след започнало изпращане. Провери принтера преди повторение."
                    : "LAN принтерът не прие връзката. Безопасно е да се опита отново.",
                outputMayExist,
                error);
        }
    }

    private static Bitmap RenderReceipt(ReceiptDocument receipt)
    {
        var width = receipt.PaperWidthMillimeters <= 58 ? 384 : 576;
        var contentWidth = Math.Max(1, width - MarginPixels * 2);

        using var measureBitmap = new Bitmap(1, 1, PixelFormat.Format24bppRgb);
        measureBitmap.SetResolution(PrinterDpi, PrinterDpi);
        using var measureGraphics = Graphics.FromImage(measureBitmap);
        ConfigureGraphics(measureGraphics);

        var height = MarginPixels;
        foreach (var line in receipt.Lines)
        {
            using var font = CreateReceiptFont(line.FontSize, line.Bold);
            height += PointsToPixels(line.SpaceBefore);
            height += (int)Math.Ceiling(Math.Max(font.GetHeight(measureGraphics) + 2f, PointsToPixels(line.FontSize * 1.12f)));
            height += PointsToPixels(line.SpaceAfter);
        }
        height += MarginPixels + 8;

        var bitmap = new Bitmap(width, Math.Clamp(height, 96, 16000), PixelFormat.Format24bppRgb);
        bitmap.SetResolution(PrinterDpi, PrinterDpi);

        using var graphics = Graphics.FromImage(bitmap);
        ConfigureGraphics(graphics);
        graphics.Clear(Color.White);

        using var brush = new SolidBrush(Color.Black);
        var y = (float)MarginPixels;

        foreach (var line in receipt.Lines)
        {
            y += PointsToPixels(line.SpaceBefore);
            using var font = CreateReceiptFont(line.FontSize, line.Bold);
            var lineHeight = Math.Max(font.GetHeight(graphics) + 2f, PointsToPixels(line.FontSize * 1.12f));

            if (!string.IsNullOrEmpty(line.Text))
            {
                using var format = new StringFormat
                {
                    Alignment = line.Alignment switch
                    {
                        ReceiptAlignment.Center => StringAlignment.Center,
                        ReceiptAlignment.Right => StringAlignment.Far,
                        _ => StringAlignment.Near
                    },
                    LineAlignment = StringAlignment.Near,
                    FormatFlags = StringFormatFlags.NoWrap,
                    Trimming = StringTrimming.None
                };

                graphics.DrawString(
                    line.Text,
                    font,
                    brush,
                    new RectangleF(MarginPixels, y, contentWidth, lineHeight + 2f),
                    format);
            }

            y += lineHeight + PointsToPixels(line.SpaceAfter);
        }

        return bitmap;
    }

    private static void ConfigureGraphics(Graphics graphics)
    {
        graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.CompositingQuality = CompositingQuality.HighQuality;
        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
    }

    private static Font CreateReceiptFont(float size, bool bold)
    {
        var style = bold ? FontStyle.Bold : FontStyle.Regular;
        try
        {
            return new Font("Consolas", size, style, GraphicsUnit.Point);
        }
        catch
        {
            return new Font(FontFamily.GenericMonospace, size, style, GraphicsUnit.Point);
        }
    }

    private static byte[] BuildEscPosPayload(Bitmap bitmap)
    {
        var bytesPerRow = (bitmap.Width + 7) / 8;
        var raster = PackMonochrome(bitmap, bytesPerRow);

        using var output = new MemoryStream(raster.Length + 128);
        output.Write(new byte[] { 0x1B, 0x40 });
        output.Write(new byte[] { 0x1B, 0x61, 0x00 });

        for (var top = 0; top < bitmap.Height; top += RasterStripeHeight)
        {
            var stripeHeight = Math.Min(RasterStripeHeight, bitmap.Height - top);
            output.Write(new byte[]
            {
                0x1D, 0x76, 0x30, 0x00,
                (byte)(bytesPerRow & 0xFF),
                (byte)((bytesPerRow >> 8) & 0xFF),
                (byte)(stripeHeight & 0xFF),
                (byte)((stripeHeight >> 8) & 0xFF)
            });
            output.Write(raster, top * bytesPerRow, stripeHeight * bytesPerRow);
        }

        output.Write(new byte[] { 0x1B, 0x64, 0x04 });
        output.Write(new byte[] { 0x1D, 0x56, 0x01 });
        return output.ToArray();
    }

    private static byte[] PackMonochrome(Bitmap bitmap, int bytesPerRow)
    {
        var result = new byte[bytesPerRow * bitmap.Height];
        var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);

        try
        {
            var stride = Math.Abs(data.Stride);
            var source = new byte[stride * bitmap.Height];
            Marshal.Copy(data.Scan0, source, 0, source.Length);

            for (var y = 0; y < bitmap.Height; y++)
            {
                var sourceRow = data.Stride >= 0 ? y * stride : (bitmap.Height - 1 - y) * stride;
                var targetRow = y * bytesPerRow;

                for (var x = 0; x < bitmap.Width; x++)
                {
                    var pixel = sourceRow + x * 3;
                    var blue = source[pixel];
                    var green = source[pixel + 1];
                    var red = source[pixel + 2];
                    var luminance = (red * 299 + green * 587 + blue * 114) / 1000;
                    if (luminance < 190)
                    {
                        result[targetRow + x / 8] |= (byte)(0x80 >> (x % 8));
                    }
                }
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return result;
    }

    private static int PointsToPixels(float points) =>
        (int)Math.Ceiling(points / 72f * PrinterDpi);
}
