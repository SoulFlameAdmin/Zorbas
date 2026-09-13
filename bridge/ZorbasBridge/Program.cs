namespace SoulFlame.ZorbasBridge;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var singleInstance = new Mutex(true, "SoulFlame.ZorbasBridge.SingleInstance", out var isFirstInstance);
        if (!isFirstInstance)
        {
            MessageBox.Show(
                "SoulFlame Restaurant Bridge вече работи до часовника.",
                "SoulFlame Restaurant Bridge",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
