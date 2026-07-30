using System.Globalization;
using System.Text.Json;

namespace SoulFlame.ZorbasBridge;

internal static class ReceiptFormatter
{
    private const int BarWidth = 42;
    private const int KitchenWidth = 34;
    private const int BillWidth = 42;

    public static ReceiptDocument Format(PrintJob job, string restaurantName)
    {
        if (job.JobType.Equals("correction", StringComparison.OrdinalIgnoreCase))
            return FormatCorrection(job, restaurantName);

        if (job.JobType.Equals("test", StringComparison.OrdinalIgnoreCase))
            return FormatTestJob(job);

        if (job.JobType.Equals("bill", StringComparison.OrdinalIgnoreCase))
            return FormatBill(job);

        return FormatStationNote(job);
    }

    private static ReceiptDocument FormatStationNote(PrintJob job)
    {
        var payload = job.Payload;
        var isKitchen = job.Destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var width = isKitchen ? KitchenWidth : BarWidth;
        var bodySize = isKitchen ? 11.6f : 9.8f;
        var itemSize = isKitchen ? 12.1f : 10.2f;
        var footerSize = isKitchen ? 10.6f : 9.4f;
        var lines = new List<ReceiptLine>();
        var orderType = GetText(payload, "order_type");
        var tableNumber = orderType.Equals("pickup", StringComparison.OrdinalIgnoreCase)
            ? "ПАКЕТ"
            : Fallback(GetText(payload, "table_number"), "—");
        var actor = Fallback(GetText(payload, "actor"), "—");
        var orderNumber = Fallback(GetText(payload, "order_number"), "—");
        var note = FirstNonEmpty(GetText(payload, "note"), GetText(payload, "order_note"));
        var cancelReason = GetText(payload, "cancel_reason");

        AddWrapped(lines, $"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}", width, bodySize);
        AddWrapped(lines, $"Маса: {tableNumber}", width, bodySize);
        AddWrapped(lines, $"Оператор: {actor}", width, bodySize, spaceAfter: 1.5f);
        AddSeparator(lines, width, bodySize, count: 2);

        AddItems(lines, payload, width, itemSize, upperCase: true);

        if (!string.IsNullOrWhiteSpace(cancelReason))
        {
            AddSeparator(lines, width, bodySize);
            AddWrapped(lines, $"ОТКАЗ: {cancelReason.ToUpperInvariant()}", width, itemSize, bold: true);
        }

        if (!string.IsNullOrWhiteSpace(note))
        {
            AddSeparator(lines, width, bodySize);
            AddWrapped(lines, $"БЕЛЕЖКА: {note.ToUpperInvariant()}", width, itemSize, bold: true);
        }

        AddSeparator(lines, width, bodySize, spaceBefore: 2f);
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ", width, isKitchen ? 13.2f : 11.8f, bold: true, spaceBefore: 2f, spaceAfter: 3f);
        AddLine(lines, AlignColumns("Номер", orderNumber, width), footerSize);
        AddWrapped(lines, $"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}", width, footerSize);
        AddPaperFeed(lines);

        return new ReceiptDocument(
            isKitchen ? "icash-kitchen-photo-v2" : "icash-bar-photo-v2",
            width,
            lines);
    }

    private static ReceiptDocument FormatBill(PrintJob job)
    {
        var payload = job.Payload;
        var lines = new List<ReceiptLine>();
        var actor = Fallback(GetText(payload, "actor"), "—");
        var operatorNumber = Fallback(GetText(payload, "operator_number"), "1");
        var table = GetText(payload, "order_type").Equals("pickup", StringComparison.OrdinalIgnoreCase)
            ? "ПАКЕТ"
            : Fallback(GetText(payload, "table_number"), "—");

        AddCentered(lines, "\"Н енд м\" ЕООД", BillWidth, 10.2f, bold: true, spaceAfter: 1f);
        AddCentered(lines, "ж.к. \"Младост\", бл. 5,", BillWidth, 9.2f);
        AddCentered(lines, "вх. В, ет. 5, ап. 14", BillWidth, 9.2f);
        AddCentered(lines, "Сливен", BillWidth, 9.6f, bold: true, spaceAfter: 3f);
        AddLine(lines, AlignColumns("Ид. №", "206740575", BillWidth), 9.4f);
        AddWrapped(lines, $"Дата: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}", BillWidth, 9.4f);
        AddLine(lines, AlignColumns(actor, operatorNumber, BillWidth), 9.4f);
        AddWrapped(lines, $"Маса: {table}", BillWidth, 9.4f, spaceAfter: 4f);

        decimal soldCount = 0;
        if (TryGetArray(payload, "items", out var items))
        {
            foreach (var item in items.EnumerateArray())
            {
                var quantity = GetNumber(item, "quantity", 1m);
                var name = Fallback(GetText(item, "name"), "Артикул").ToUpperInvariant();
                var unitPrice = GetNumber(item, "unit_price", 0m);
                soldCount += quantity;

                AddWrapped(lines, name, BillWidth, 9.7f, bold: true);
                AddLine(lines, AlignColumns(
                    $"{FormatQuantity(quantity)} бр x {FormatMoney(unitPrice)}",
                    $"{FormatMoney(quantity * unitPrice)} Б",
                    BillWidth), 9.6f, spaceAfter: 1f);

                var itemNote = GetText(item, "note");
                if (!string.IsNullOrWhiteSpace(itemNote))
                    AddWrapped(lines, $"БЕЛЕЖКА: {itemNote.ToUpperInvariant()}", BillWidth, 8.8f, bold: true, spaceAfter: 1f);
            }
        }

        AddLine(lines, string.Empty, 7f, spaceAfter: 2f);
        AddWrapped(lines, "Общо продадени", BillWidth, 12.6f, bold: true);
        AddLine(lines, AlignColumns("артикули", FormatQuantity(soldCount), BillWidth), 12.6f, bold: true, spaceAfter: 3f);

        var subtotal = TryGetNumber(payload, "subtotal", out var total) ? total : 0m;
        AddLine(lines, AlignColumns("Total:", FormatMoney(subtotal), BillWidth), 15.2f, bold: true, spaceBefore: 2f, spaceAfter: 3f);
        AddCentered(lines, "НЕФИСКАЛНА СМЕТКА", BillWidth, 8.4f, bold: true);
        AddPaperFeed(lines);

        return new ReceiptDocument("icash-bill-photo-v2", BillWidth, lines);
    }

    private static ReceiptDocument FormatTestJob(PrintJob job)
    {
        var payload = job.Payload;
        var isKitchen = job.Destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var width = isKitchen ? KitchenWidth : BarWidth;
        var bodySize = isKitchen ? 11.6f : 9.8f;
        var lines = new List<ReceiptLine>();
        var actor = Fallback(GetText(payload, "actor"), "ТЕЛЕФОН");
        var number = Fallback(GetText(payload, "order_number"), "TEST");

        AddWrapped(lines, $"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}", width, bodySize);
        AddWrapped(lines, "Маса: TEST", width, bodySize);
        AddWrapped(lines, $"Оператор: {actor}", width, bodySize, spaceAfter: 1.5f);
        AddSeparator(lines, width, bodySize, count: 2);
        AddCentered(lines, "TEST ОТ ТЕЛЕФОНА", width, isKitchen ? 13f : 11.2f, bold: true, spaceBefore: 2f);
        AddCentered(lines, isKitchen ? "PRINT 2 · КУХНЯ" : "PRINT 1 · БАР", width, isKitchen ? 11.4f : 9.8f, bold: true, spaceAfter: 2f);

        if (TryGetArray(payload, "items", out var items) && items.GetArrayLength() > 0)
            AddItems(lines, payload, width, isKitchen ? 12.1f : 10.2f, upperCase: true);
        else
            AddWrapped(lines, isKitchen ? "1 x ТЕСТ КУХНЯ" : "1 x ТЕСТ ХРАНА И НАПИТКА", width, isKitchen ? 12.1f : 10.2f, bold: true);

        AddSeparator(lines, width, bodySize, spaceBefore: 2f);
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ", width, isKitchen ? 13.2f : 11.8f, bold: true, spaceBefore: 2f, spaceAfter: 3f);
        AddLine(lines, AlignColumns("Номер", number, width), isKitchen ? 10.6f : 9.4f);
        AddWrapped(lines, $"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}", width, isKitchen ? 10.6f : 9.4f);
        AddPaperFeed(lines);

        return new ReceiptDocument(
            isKitchen ? "icash-kitchen-test-v2" : "icash-bar-test-v2",
            width,
            lines);
    }

    private static ReceiptDocument FormatCorrection(PrintJob job, string restaurantName)
    {
        var payload = job.Payload;
        var isKitchen = job.Destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var width = isKitchen ? KitchenWidth : BarWidth;
        var bodySize = isKitchen ? 11.4f : 9.6f;
        var lines = new List<ReceiptLine>();
        var tableNumber = GetText(payload, "table_number");
        var orderNumber = GetText(payload, "order_number");
        var visitLabel = GetText(payload, "visit_label");
        var revision = GetText(payload, "revision");
        var actor = GetText(payload, "actor");
        var reason = GetText(payload, "reason");

        AddCentered(lines, RestaurantTitle(restaurantName), width, bodySize, bold: true);
        AddCentered(lines, "КОРЕКЦИЯ / ПРОМЕНЕНО", width, isKitchen ? 13.4f : 11.8f, bold: true, spaceAfter: 2f);
        AddSeparator(lines, width, bodySize, '=');
        AddCentered(lines, $"МАСА {Fallback(tableNumber, "—")}", width, isKitchen ? 13.4f : 11.8f, bold: true);
        if (!string.IsNullOrWhiteSpace(visitLabel)) AddCentered(lines, visitLabel.ToUpperInvariant(), width, bodySize, bold: true);
        AddWrapped(lines, $"Поръчка № {Fallback(orderNumber, "—")}", width, bodySize);
        if (!string.IsNullOrWhiteSpace(revision)) AddWrapped(lines, $"Версия: {revision}", width, bodySize);
        AddWrapped(lines, $"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}", width, bodySize);
        if (!string.IsNullOrWhiteSpace(actor)) AddWrapped(lines, $"Сервитьор: {actor}", width, bodySize);

        AddSeparator(lines, width, bodySize);
        AddCentered(lines, "ПРОМЕНЕНО", width, isKitchen ? 12.6f : 10.8f, bold: true);

        var hasChanges = false;
        if (TryGetArray(payload, "changes", out var changes))
        {
            foreach (var change in changes.EnumerateArray())
            {
                hasChanges = true;
                var delta = GetNumber(change, "delta", 0m);
                var name = Fallback(GetText(change, "name"), "Артикул");
                var sign = delta > 0 ? "+" : string.Empty;
                AddWrapped(lines, $"{sign}{FormatQuantity(delta)} x {name.ToUpperInvariant()}", width, isKitchen ? 12.1f : 10.2f, bold: true);
            }
        }

        if (!hasChanges) AddWrapped(lines, "НЯМА ОПИСАНИ ПРОМЕНИ.", width, bodySize);

        AddSeparator(lines, width, bodySize);
        AddCentered(lines, "НОВО", width, isKitchen ? 12.6f : 10.8f, bold: true);
        AddItems(lines, payload, width, isKitchen ? 12.1f : 10.2f, upperCase: true);

        if (!string.IsNullOrWhiteSpace(reason))
        {
            AddSeparator(lines, width, bodySize);
            AddWrapped(lines, $"ПРИЧИНА: {reason.ToUpperInvariant()}", width, isKitchen ? 12.1f : 10.2f, bold: true);
        }

        AddPaperFeed(lines);
        return new ReceiptDocument(
            isKitchen ? "icash-kitchen-correction-v2" : "icash-bar-correction-v2",
            width,
            lines);
    }

    public static ReceiptDocument TestReceipt(string destination, string printerName)
    {
        var isKitchen = destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var width = isKitchen ? KitchenWidth : BarWidth;
        var bodySize = isKitchen ? 11.6f : 9.8f;
        var lines = new List<ReceiptLine>();

        AddWrapped(lines, $"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}", width, bodySize);
        AddWrapped(lines, "Маса: TEST", width, bodySize);
        AddWrapped(lines, "Оператор: ZORBAS BRIDGE", width, bodySize, spaceAfter: 1.5f);
        AddSeparator(lines, width, bodySize, count: 2);
        AddCentered(lines, "TEST", width, isKitchen ? 14f : 12f, bold: true);
        AddCentered(lines, isKitchen ? "PRINT 2 · КУХНЯ" : "PRINT 1 · БАР", width, isKitchen ? 11.4f : 9.8f, bold: true);
        AddWrapped(lines, $"Windows: {printerName}", width, isKitchen ? 9.8f : 8.6f, spaceAfter: 2f);
        AddWrapped(lines, isKitchen ? "1 x ТЕСТ КУХНЯ" : "1 x ТЕСТ ХРАНА И НАПИТКА", width, isKitchen ? 12.1f : 10.2f, bold: true);
        AddSeparator(lines, width, bodySize, spaceBefore: 2f);
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ", width, isKitchen ? 13.2f : 11.8f, bold: true, spaceBefore: 2f, spaceAfter: 3f);
        AddLine(lines, AlignColumns("Номер", DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture), width), isKitchen ? 10.6f : 9.4f);
        AddWrapped(lines, $"Час: {DateTime.Now:dd.MM.yyyy HH:mm:ss}", width, isKitchen ? 10.6f : 9.4f);
        AddPaperFeed(lines);

        return new ReceiptDocument(
            isKitchen ? "icash-kitchen-test-v2" : "icash-bar-test-v2",
            width,
            lines);
    }

    private static void AddItems(
        ICollection<ReceiptLine> lines,
        JsonElement payload,
        int width,
        float fontSize,
        bool upperCase)
    {
        var hasItems = false;
        if (TryGetArray(payload, "items", out var items))
        {
            foreach (var item in items.EnumerateArray())
            {
                hasItems = true;
                var quantity = GetNumber(item, "quantity", 1m);
                var name = Fallback(GetText(item, "name"), "Артикул");
                if (upperCase) name = name.ToUpperInvariant();
                AddWrapped(lines, $"{FormatQuantity(quantity)} x {name}", width, fontSize, bold: true);

                var itemNote = GetText(item, "note");
                if (!string.IsNullOrWhiteSpace(itemNote))
                {
                    var text = upperCase ? itemNote.ToUpperInvariant() : itemNote;
                    AddWrapped(lines, $"БЕЛЕЖКА: {text}", width, Math.Max(8.4f, fontSize - 1f), bold: true, spaceAfter: 1f);
                }
            }
        }

        if (!hasItems) AddWrapped(lines, "НЯМА АРТИКУЛИ.", width, fontSize, bold: true);
    }

    private static void AddPaperFeed(ICollection<ReceiptLine> lines)
    {
        for (var index = 0; index < 4; index++) AddLine(lines, string.Empty, 7f, spaceAfter: 2f);
    }

    private static string RestaurantTitle(string restaurantName) =>
        string.IsNullOrWhiteSpace(restaurantName) ? "ZORBAS" : restaurantName.ToUpperInvariant();

    private static bool TryGetArray(JsonElement element, string property, out JsonElement value)
    {
        value = default;
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(property, out value)
            && value.ValueKind == JsonValueKind.Array;
    }

    private static string GetText(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var value))
            return string.Empty;

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => string.Empty
        };
    }

    private static decimal GetNumber(JsonElement element, string property, decimal fallback) =>
        TryGetNumber(element, property, out var value) ? value : fallback;

    private static bool TryGetNumber(JsonElement element, string property, out decimal value)
    {
        value = 0;
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var token))
            return false;

        if (token.ValueKind == JsonValueKind.Number && token.TryGetDecimal(out value)) return true;
        if (token.ValueKind == JsonValueKind.String)
        {
            return decimal.TryParse(token.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out value)
                || decimal.TryParse(token.GetString(), NumberStyles.Number, CultureInfo.GetCultureInfo("bg-BG"), out value);
        }

        return false;
    }

    private static string FormatDateSeconds(string value, DateTimeOffset? fallback)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
            return parsed.ToLocalTime().ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("bg-BG"));

        return fallback?.ToLocalTime().ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("bg-BG"))
            ?? value;
    }

    private static string FormatQuantity(decimal value) =>
        value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("0.00", CultureInfo.InvariantCulture);

    private static string FirstNonEmpty(params string[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

    private static string Fallback(string value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static void AddLine(
        ICollection<ReceiptLine> lines,
        string text,
        float fontSize,
        bool bold = false,
        ReceiptAlignment alignment = ReceiptAlignment.Left,
        float spaceBefore = 0f,
        float spaceAfter = 0f) =>
        lines.Add(new ReceiptLine(text, fontSize, bold, alignment, spaceBefore, spaceAfter));

    private static void AddCentered(
        ICollection<ReceiptLine> lines,
        string text,
        int width,
        float fontSize,
        bool bold = false,
        float spaceBefore = 0f,
        float spaceAfter = 0f)
    {
        var wrappedLines = Wrap(text, width).ToArray();
        for (var index = 0; index < wrappedLines.Length; index++)
        {
            AddLine(
                lines,
                wrappedLines[index],
                fontSize,
                bold,
                ReceiptAlignment.Center,
                index == 0 ? spaceBefore : 0f,
                index == wrappedLines.Length - 1 ? spaceAfter : 0f);
        }
    }

    private static void AddWrapped(
        ICollection<ReceiptLine> lines,
        string text,
        int width,
        float fontSize,
        bool bold = false,
        ReceiptAlignment alignment = ReceiptAlignment.Left,
        float spaceBefore = 0f,
        float spaceAfter = 0f)
    {
        var wrappedLines = Wrap(text, width).ToArray();
        for (var index = 0; index < wrappedLines.Length; index++)
        {
            AddLine(
                lines,
                wrappedLines[index],
                fontSize,
                bold,
                alignment,
                index == 0 ? spaceBefore : 0f,
                index == wrappedLines.Length - 1 ? spaceAfter : 0f);
        }
    }

    private static void AddSeparator(
        ICollection<ReceiptLine> lines,
        int width,
        float fontSize,
        char character = '-',
        int count = 1,
        float spaceBefore = 0f,
        float spaceAfter = 0f)
    {
        for (var index = 0; index < count; index++)
        {
            AddLine(
                lines,
                new string(character, width),
                Math.Max(7.5f, fontSize - 1f),
                spaceBefore: index == 0 ? spaceBefore : 0f,
                spaceAfter: index == count - 1 ? spaceAfter : 0f);
        }
    }

    private static IEnumerable<string> Wrap(string text, int width)
    {
        var remaining = (text ?? string.Empty).Trim();
        if (remaining.Length == 0)
        {
            yield return string.Empty;
            yield break;
        }

        while (remaining.Length > width)
        {
            var split = remaining.LastIndexOf(' ', width);
            if (split <= 0) split = width;
            yield return remaining[..split].TrimEnd();
            remaining = remaining[split..].TrimStart();
        }

        yield return remaining;
    }

    private static string AlignColumns(string left, string right, int width)
    {
        left = (left ?? string.Empty).Trim();
        right = (right ?? string.Empty).Trim();
        var spaces = width - left.Length - right.Length;
        if (spaces < 1)
        {
            var allowedLeft = Math.Max(1, width - right.Length - 1);
            left = left.Length > allowedLeft ? left[..allowedLeft] : left;
            spaces = Math.Max(1, width - left.Length - right.Length);
        }

        return left + new string(' ', spaces) + right;
    }
}
