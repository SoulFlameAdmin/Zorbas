using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;

namespace SoulFlame.ZorbasBridge;

internal sealed class WindowsPrinterService
{
    public IReadOnlyList<string> GetInstalledPrinters() =>
        PrinterSettings.InstalledPrinters
            .Cast<string>()
            .OrderBy(name => name, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();

    public bool IsPrinterAvailable(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName)) return false;
        var settings = new PrinterSettings { PrinterName = printerName };
        return settings.IsValid;
    }

    public Task PrintReceiptAsync(
        string printerName,
        ReceiptDocument receipt,
        string documentName,
        CancellationToken cancellationToken = default)
    {
        if (!IsPrinterAvailable(printerName))
        {
            throw new InvalidOperationException($"Windows принтерът „{printerName}“ не е наличен.");
        }

        return Task.Run(() => Print(printerName, receipt, documentName, cancellationToken), cancellationToken);
    }

    private static void Print(
        string printerName,
        ReceiptDocument receipt,
        string documentName,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var widthHundredths = (int)Math.Round(receipt.PaperWidthMillimeters / 25.4d * 100d);
        var heightHundredths = EstimatePaperHeight(receipt);

        using var document = new PrintDocument
        {
            DocumentName = string.IsNullOrWhiteSpace(documentName) ? "Zorbas Bridge" : documentName,
            PrintController = new StandardPrintController(),
            PrinterSettings = new PrinterSettings { PrinterName = printerName }
        };

        document.OriginAtMargins = true;
        document.DefaultPageSettings.Margins = new Margins(4, 4, 4, 4);
        document.DefaultPageSettings.PaperSize = new PaperSize(
            $"Zorbas {receipt.PaperWidthMillimeters}mm",
            widthHundredths,
            heightHundredths);

        var lineIndex = 0;

        document.PrintPage += (_, eventArgs) =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            var graphics = eventArgs.Graphics ?? throw new InvalidOperationException("Windows не върна печатна графика.");
            graphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
            graphics.SmoothingMode = SmoothingMode.HighQuality;
            graphics.PageUnit = GraphicsUnit.Display;

            using var brush = new SolidBrush(Color.Black);
            var x = 0f;
            var y = 0f;
            var printableWidth = Math.Max(1f, eventArgs.MarginBounds.Width);
            var bottom = Math.Max(1f, eventArgs.MarginBounds.Height);

            while (lineIndex < receipt.Lines.Count)
            {
                var line = receipt.Lines[lineIndex];
                y += PointsToDisplay(line.SpaceBefore);

                using var font = CreateReceiptFont(line.FontSize, line.Bold);
                var lineHeight = Math.Max(font.GetHeight(graphics) + 1.2f, PointsToDisplay(line.FontSize * 1.15f));

                if (y + lineHeight + PointsToDisplay(line.SpaceAfter) > bottom)
                {
                    eventArgs.HasMorePages = true;
                    return;
                }

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
                        new RectangleF(x, y, printableWidth, lineHeight + 2f),
                        format);
                }

                y += lineHeight + PointsToDisplay(line.SpaceAfter);
                lineIndex++;
            }

            eventArgs.HasMorePages = false;
        };

        document.Print();
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

    private static int EstimatePaperHeight(ReceiptDocument receipt)
    {
        var totalPoints = 12f;
        foreach (var line in receipt.Lines)
        {
            totalPoints += line.SpaceBefore + line.SpaceAfter + Math.Max(10f, line.FontSize * 1.55f);
        }

        var hundredths = (int)Math.Ceiling(totalPoints / 72f * 100f) + 16;
        return Math.Clamp(hundredths, 240, 32000);
    }

    private static float PointsToDisplay(float points) => points / 72f * 100f;
}
