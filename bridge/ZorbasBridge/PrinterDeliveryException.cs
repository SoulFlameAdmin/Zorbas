namespace SoulFlame.ZorbasBridge;

internal sealed class PrinterDeliveryException : Exception
{
    public PrinterDeliveryException(string message, bool mayHaveProducedOutput, Exception innerException)
        : base(message, innerException)
    {
        MayHaveProducedOutput = mayHaveProducedOutput;
    }

    public bool MayHaveProducedOutput { get; }
}
