using System.Globalization;
using System.Text.Json;

namespace SoulFlame.ZorbasBridge;

internal static class ReceiptFormatter
{
    private const int Width = 42;

    public static IReadOnlyList<string> Format(PrintJob job, string restaurantName)
    {
        var lines = new List<string>();
        var payload = job.Payload;
        var isStaff = job.Destination.Equals("staff", StringComparison.OrdinalIgnoreCase);
        var orderType = GetText(payload, "order_type");
        var tableNumber = GetText(payload, "table_number");
        var orderNumber = GetText(payload, "order_number");
        var actor = GetText(payload, "actor");
        var readyAt = GetText(payload, "ready_at");
        var note = FirstNonEmpty(GetText(payload, "note"), GetText(payload, "order_note"));
        var cancelReason = GetText(payload, "cancel_reason");

        AddCentered(lines, string.IsNullOrWhiteSpace(restaurantName) ? "ZORBAS" : restaurantName.ToUpperInvariant());
        AddCentered(lines, Title(job.JobType));
        lines.Add(new string('-', Width));

        if (orderType.Equals("pickup", StringComparison.OrdinalIgnoreCase))
        {
            AddCentered(lines, "ПАКЕТ / ЗА ВКЪЩИ");
        }
        else
        {
            AddCentered(lines, $"МАСА {Fallback(tableNumber, "—")}");
        }

        lines.Add($"Поръчка № {Fallback(orderNumber, "—")}");
        lines.Add($"Час: {FormatDate(GetText(payload, "created_at"), job.CreatedAt)}");
        if (!string.IsNullOrWhiteSpace(actor)) lines.Add($"Сервитьор: {actor}");
        if (!string.IsNullOrWhiteSpace(readyAt)) lines.Add($"За час: {FormatDate(readyAt, null)}");
        lines.Add(new string('-', Width));

        if (payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("items", out var items) &&
            items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                var quantity = GetNumber(item, "quantity", 1m);
                var name = Fallback(GetText(item, "name"), "Артикул");
                AddWrapped(lines, $"{quantity:0.##} x {name}");

                var itemNote = GetText(item, "note");
                if (!string.IsNullOrWhiteSpace(itemNote)) AddWrapped(lines, $"  БЕЛЕЖКА: {itemNote}");

                if (isStaff && TryGetNumber(item, "unit_price", out var unitPrice))
                {
                    lines.Add(AlignColumns(
                        $"  {quantity:0.##} x {unitPrice:0.00}",
                        $"{quantity * unitPrice:0.00} лв."));
                }
            }
        }
        else
        {
            lines.Add("Няма артикули.");
        }

        if (!string.IsNullOrWhiteSpace(cancelReason))
        {
            lines.Add(new string('-', Width));
            AddWrapped(lines, $"ОТКАЗ: {cancelReason}");
        }

        if (!string.IsNullOrWhiteSpace(note))
        {
            lines.Add(new string('-', Width));
            AddWrapped(lines, $"ОБЩА БЕЛЕЖКА: {note}");
        }

        if (isStaff && TryGetNumber(payload, "subtotal", out var subtotal))
        {
            lines.Add(new string('=', Width));
            lines.Add(AlignColumns("ОБЩО", $"{subtotal:0.00} лв."));
        }

        lines.Add(new string('-', Width));
        AddCentered(lines, "powered by SoulFlame");
        lines.Add(string.Empty);
        lines.Add(string.Empty);
        lines.Add(string.Empty);
        return lines;
    }

    public static IReadOnlyList<string> TestReceipt(string destination, string printerName)
    {
        var lines = new List<string>();
        AddCentered(lines, "ZORBAS BRIDGE");
        AddCentered(lines, "ТЕСТОВ ПЕЧАТ");
        lines.Add(new string('-', Width));
        lines.Add($"Канал: {(destination == "kitchen" ? "Print 2 · Кухня" : "Print 1 · Сервитьори")}");
        AddWrapped(lines, $"Windows принтер: {printerName}");
        lines.Add($"Час: {DateTime.Now:dd.MM.yyyy HH:mm:ss}");
        lines.Add(new string('-', Width));
        AddCentered(lines, "ВРЪЗКАТА Е ГОТОВА");
        AddCentered(lines, "SoulFlame Restaurant OS");
        lines.Add(string.Empty);
        lines.Add(string.Empty);
        lines.Add(string.Empty);
        return lines;
    }

    private static string Title(string? type) => type switch
    {
        "cancellation" => "ОТКАЗАНА ПОРЪЧКА",
        "bill" => "СМЕТКА",
        "pickup" => "ПАКЕТ",
        "addition" => "ДОБАВКА",
        _ => "ПОРЪЧКА"
    };

    private static string GetText(JsonElement element, string property)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var value)) return string.Empty;
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
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(property, out var token)) return false;
        if (token.ValueKind == JsonValueKind.Number && token.TryGetDecimal(out value)) return true;
        if (token.ValueKind == JsonValueKind.String)
        {
            return decimal.TryParse(token.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out value)
                || decimal.TryParse(token.GetString(), NumberStyles.Number, CultureInfo.GetCultureInfo("bg-BG"), out value);
        }
        return false;
    }

    private static string FormatDate(string value, DateTimeOffset? fallback)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
        {
            return parsed.ToLocalTime().ToString("dd.MM.yyyy HH:mm", CultureInfo.GetCultureInfo("bg-BG"));
        }
        return fallback?.ToLocalTime().ToString("dd.MM.yyyy HH:mm", CultureInfo.GetCultureInfo("bg-BG")) ?? value;
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
