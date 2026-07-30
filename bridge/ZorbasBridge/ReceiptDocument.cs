namespace SoulFlame.ZorbasBridge;

internal enum ReceiptAlignment
{
    Left,
    Center,
    Right
}

internal sealed record ReceiptLine(
    string Text,
    float FontSize = 9.4f,
    bool Bold = false,
    ReceiptAlignment Alignment = ReceiptAlignment.Left,
    float SpaceBefore = 0f,
    float SpaceAfter = 0f);

internal sealed record ReceiptDocument(
    string Profile,
    int CharacterWidth,
    IReadOnlyList<ReceiptLine> Lines,
    int PaperWidthMillimeters = 80);
