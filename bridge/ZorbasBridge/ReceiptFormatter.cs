using System.Globalization;
using System.Text.Json;

namespace SoulFlame.ZorbasBridge;

internal static class ReceiptFormatter
{
    private const int Width = 42;

    public static IReadOnlyList<string> Format(PrintJob job, string restaurantName)
    {
        if (job.JobType.Equals("correction", StringComparison.OrdinalIgnoreCase))
            return FormatCorrection(job, restaurantName);

        if (job.JobType.Equals("test", StringComparison.OrdinalIgnoreCase))
            return FormatTestJob(job);

        if (job.JobType.Equals("bill", StringComparison.OrdinalIgnoreCase))
            return FormatBill(job);

        return FormatStationNote(job);
    }

    private static IReadOnlyList<string> FormatStationNote(PrintJob job)
    {
        var lines = new List<string>();
        var payload = job.Payload;
        var isKitchen = job.Destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var orderType = GetText(payload, "order_type");
        var tableNumber = orderType.Equals("pickup", StringComparison.OrdinalIgnoreCase)
            ? "ПАКЕТ"
            : Fallback(GetText(payload, "table_number"), "—");
        var actor = Fallback(GetText(payload, "actor"), "—");
        var orderNumber = Fallback(GetText(payload, "order_number"), "—");
        var note = FirstNonEmpty(GetText(payload, "note"), GetText(payload, "order_note"));
        var cancelReason = GetText(payload, "cancel_reason");

        lines.Add($"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}");
        lines.Add($"Маса: {tableNumber}");
        lines.Add($"Оператор: {actor}");
        lines.Add(new string('-', Width));

        AddItems(lines, payload, includePrices: false, upperCase: true);

        if (!string.IsNullOrWhiteSpace(cancelReason))
        {
            lines.Add(new string('-', Width));
            AddWrapped(lines, $"ОТКАЗ: {cancelReason.ToUpperInvariant()}");
        }

        if (!string.IsNullOrWhiteSpace(note))
        {
            lines.Add(new string('-', Width));
            AddWrapped(lines, $"БЕЛЕЖКА: {note.ToUpperInvariant()}");
        }

        lines.Add(new string('-', Width));
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ");
        lines.Add(AlignColumns("Номер", orderNumber));
        lines.Add($"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}");
        AddPaperFeed(lines);
        return lines;
    }

    private static IReadOnlyList<string> FormatBill(PrintJob job)
    {
        var lines = new List<string>();
        var payload = job.Payload;
        var actor = Fallback(GetText(payload, "actor"), "—");
        var table = GetText(payload, "order_type").Equals("pickup", StringComparison.OrdinalIgnoreCase)
            ? "ПАКЕТ"
            : Fallback(GetText(payload, "table_number"), "—");

        AddCentered(lines, "\"Н енд м\" ЕООД");
        AddCentered(lines, "ж.к. \"Младост\", бл. 5,");
        AddCentered(lines, "вх. В, ет. 5, ап. 14");
        AddCentered(lines, "Сливен");
        lines.Add(AlignColumns("Ид. №", "206740575"));
        lines.Add($"Дата: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}");
        lines.Add(AlignColumns(actor, "1"));
        lines.Add($"Маса: {table}");
        lines.Add(string.Empty);

        decimal soldCount = 0;
        if (TryGetArray(payload, "items", out var items))
        {
            foreach (var item in items.EnumerateArray())
            {
                var quantity = GetNumber(item, "quantity", 1m);
                var name = Fallback(GetText(item, "name"), "Артикул").ToUpperInvariant();
                var unitPrice = GetNumber(item, "unit_price", 0m);
                soldCount += quantity;

                AddWrapped(lines, name);
                lines.Add(AlignColumns(
                    $"{quantity:0.##} бр x {unitPrice:0.00}",
                    $"{quantity * unitPrice:0.00} Б"));

                var itemNote = GetText(item, "note");
                if (!string.IsNullOrWhiteSpace(itemNote))
                    AddWrapped(lines, $"БЕЛЕЖКА: {itemNote.ToUpperInvariant()}");
            }
        }

        lines.Add(string.Empty);
        lines.Add("Общо продадени");
        lines.Add(AlignColumns("артикули", soldCount.ToString("0.##", CultureInfo.InvariantCulture)));

        var subtotal = TryGetNumber(payload, "subtotal", out var total) ? total : 0m;
        lines.Add(AlignColumns("Total:", subtotal.ToString("0.00", CultureInfo.InvariantCulture)));
        AddPaperFeed(lines);
        return lines;
    }

    private static IReadOnlyList<string> FormatTestJob(PrintJob job)
    {
        var lines = new List<string>();
        var payload = job.Payload;
        var isKitchen = job.Destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        var actor = Fallback(GetText(payload, "actor"), "ТЕЛЕФОН");
        var number = Fallback(GetText(payload, "order_number"), "TEST");

        lines.Add($"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}");
        lines.Add("Маса: TEST");
        lines.Add($"Оператор: {actor}");
        lines.Add(new string('-', Width));
        AddCentered(lines, "TEST ОТ ТЕЛЕФОНА");
        AddCentered(lines, isKitchen ? "PRINT 2 · КУХНЯ" : "PRINT 1 · СЕРВИТЬОРИ");
        lines.Add(new string('-', Width));
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ");
        lines.Add(AlignColumns("Номер", number));
        lines.Add($"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}");
        AddPaperFeed(lines);
        return lines;
    }

    private static IReadOnlyList<string> FormatCorrection(PrintJob job, string restaurantName)
    {
        var lines = new List<string>();
        var payload = job.Payload;
        var tableNumber = GetText(payload, "table_number");
        var orderNumber = GetText(payload, "order_number");
        var visitLabel = GetText(payload, "visit_label");
        var revision = GetText(payload, "revision");
        var actor = GetText(payload, "actor");
        var reason = GetText(payload, "reason");

        AddCentered(lines, RestaurantTitle(restaurantName));
        AddCentered(lines, "КОРЕКЦИЯ / ПРОМЕНЕНО");
        lines.Add(new string('=', Width));
        AddCentered(lines, $"МАСА {Fallback(tableNumber, "—")}");
        if (!string.IsNullOrWhiteSpace(visitLabel)) AddCentered(lines, visitLabel.ToUpperInvariant());
        lines.Add($"Поръчка № {Fallback(orderNumber, "—")}");
        if (!string.IsNullOrWhiteSpace(revision)) lines.Add($"Версия: {revision}");
        lines.Add($"Час: {FormatDateSeconds(GetText(payload, "created_at"), job.CreatedAt)}");
        if (!string.IsNullOrWhiteSpace(actor)) lines.Add($"Сервитьор: {actor}");

        lines.Add(new string('-', Width));
        AddCentered(lines, "ПРОМЕНЕНО");

        var hasChanges = false;
        if (TryGetArray(payload, "changes", out var changes))
        {
            foreach (var change in changes.EnumerateArray())
            {
                hasChanges = true;
                var delta = GetNumber(change, "delta", 0m);
                var name = Fallback(GetText(change, "name"), "Артикул");
                var sign = delta > 0 ? "+" : string.Empty;
                AddWrapped(lines, $"{sign}{delta:0.##} x {name.ToUpperInvariant()}");
            }
        }

        if (!hasChanges) lines.Add("Няма описани промени.");

        lines.Add(new string('-', Width));
        AddCentered(lines, "НОВО");
        AddItems(lines, payload, includePrices: false, upperCase: true);

        if (!string.IsNullOrWhiteSpace(reason))
        {
            lines.Add(new string('-', Width));
            AddWrapped(lines, $"ПРИЧИНА: {reason.ToUpperInvariant()}");
        }

        AddPaperFeed(lines);
        return lines;
    }

    public static IReadOnlyList<string> TestReceipt(string destination, string printerName)
    {
        var lines = new List<string>();
        var isKitchen = destination.Equals("kitchen", StringComparison.OrdinalIgnoreCase);
        lines.Add($"Щанд: {(isKitchen ? "КУХНЯ" : "БАР")}");
        lines.Add("Маса: TEST");
        lines.Add("Оператор: ZORBAS BRIDGE");
        lines.Add(new string('-', Width));
        AddCentered(lines, "TEST");
        AddCentered(lines, isKitchen ? "PRINT 2 · КУХНЯ" : "PRINT 1 · СЕРВИТЬОРИ");
        AddWrapped(lines, $"Windows: {printerName}");
        lines.Add(new string('-', Width));
        AddCentered(lines, "НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ");
        lines.Add(AlignColumns("Номер", DateTime.Now.ToString("HHmmss")));
        lines.Add($"Час: {DateTime.Now:dd.MM.yyyy HH:mm:ss}");
        AddPaperFeed(lines);
        return lines;
    }

    private static void AddItems(
        ICollection<string> lines,
        JsonElement payload,
        bool includePrices,
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
                AddWrapped(lines, $"{quantity:0.##} x {name}");

                var itemNote = GetText(item, "note");
                if (!string.IsNullOrWhiteSpace(itemNote))
                {
                    var text = upperCase ? itemNote.ToUpperInvariant() : itemNote;
                    AddWrapped(lines, $"  БЕЛЕЖКА: {text}");
                }

                if (includePrices && TryGetNumber(item, "unit_price", out var unitPrice))
                {
                    lines.Add(AlignColumns(
                        $"  {quantity:0.##} x {unitPrice:0.00}",
                        $"{quantity * unitPrice:0.00} лв."));
                }
            }
        }

        if (!hasItems) lines.Add("НЯМА АРТИКУЛИ.");
    }

    private static void AddPaperFeed(ICollection<string> lines)
    {
        lines.Add(string.Empty);
        lines.Add(string.Empty);
        lines.Add(string.Empty);
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

    private static string FirstNonEmpty(params string[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

    private static string Fallback(string value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static void AddCentered(ICollection<string> lines, string text)
    {
        foreach (var wrapped in Wrap(text, Width))
        {
            var padding = Math.Max(0, (Width - wrapped.Length) / 2);
            lines.Add(new string(' ', padding) + wrapped);
        }
    }

    private static void AddWrapped(ICollection<string> lines, string text)
    {
        foreach (var wrapped in Wrap(text, Width)) lines.Add(wrapped);
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

    private static string AlignColumns(string left, string right)
    {
        left = left.Trim();
        right = right.Trim();
        var spaces = Width - left.Length - right.Length;
        if (spaces < 1)
        {
            var allowedLeft = Math.Max(1, Width - right.Length - 1);
            left = left.Length > allowedLeft ? left[..allowedLeft] : left;
            spaces = Math.Max(1, Width - left.Length - right.Length);
        }

        return left + new string(' ', spaces) + right;
    }
}
