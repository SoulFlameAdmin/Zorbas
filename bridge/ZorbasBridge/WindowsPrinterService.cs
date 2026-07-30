using System.Drawing.Printing;

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
        using var settings = new PrinterSettings { PrinterName = printerName };
        return settings.IsValid;
    }

    public Task PrintReceiptAsync(
        string printerName,
        IReadOnlyList<string> lines,
        string documentName,
        CancellationToken cancellationToken = default)
    {
        if (!IsPrinterAvailable(printerName))
        {
            throw new InvalidOperationException($"Windows принтерът „{printerName}“ не е наличен.");
        }

        return Task.Run(() => Print(printerName, lines, documentName, cancellationToken), cancellationToken);
    }

    private static void Print(
        string printerName,
        IReadOnlyList<string> lines,
        string documentName,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var document = new PrintDocument
        {
            DocumentName = string.IsNullOrWhiteSpace(documentName) ? "Zorbas Bridge" : documentName,
            PrintController = new StandardPrintController(),
            PrinterSettings = new PrinterSettings { PrinterName = printerName }
        };

        document.DefaultPageSettings.Margins = new Margins(8, 8, 8, 8);
        var lineIndex = 0;

        document.PrintPage += (_, eventArgs) =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            var graphics = eventArgs.Graphics ?? throw new InvalidOperationException("Windows не върна печатна графика.");

            using var font = new Font(FontFamily.GenericMonospace, 8.5f, FontStyle.Regular, GraphicsUnit.Point);
            using var boldFont = new Font(FontFamily.GenericMonospace, 9.2f, FontStyle.Bold, GraphicsUnit.Point);
            using var brush = new SolidBrush(Color.Black);

            var lineHeight = Math.Max(font.GetHeight(graphics) + 1.5f, 12f);
            var x = eventArgs.MarginBounds.Left;
            var y = eventArgs.MarginBounds.Top;
            var bottom = eventArgs.MarginBounds.Bottom;

            while (lineIndex < lines.Count)
            {
                if (y + lineHeight > bottom)
                {
                    eventArgs.HasMorePages = true;
                    return;
                }

                var line = lines[lineIndex] ?? string.Empty;
                var useBold = line.Contains("ОБЩО", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("ПОРЪЧКА", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("МАСА", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("ТЕСТОВ ПЕЧАТ", StringComparison.OrdinalIgnoreCase);

                graphics.DrawString(line, useBold ? boldFont : font, brush, x, y);
                y += lineHeight;
                lineIndex++;
            }

            eventArgs.HasMorePages = false;
        };

        document.Print();
    }
}
