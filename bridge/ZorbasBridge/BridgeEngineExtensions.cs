namespace SoulFlame.ZorbasBridge;

internal static class BridgeEngineExtensions
{
    public static async ValueTask DisposeAsync(this BridgeEngine engine)
    {
        await engine.StopAsync().ConfigureAwait(false);
    }
}
