using System.Diagnostics;
using System.Text;

namespace SoulFlame.ZorbasPrinterScanner;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Any(argument => string.Equals(argument, "--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            return RunSelfTest();
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
        return 0;
    }

    private static int RunSelfTest()
    {
        var scriptPath = Path.Combine(Path.GetTempPath(), $"zorbas-printer-self-test-{Guid.NewGuid():N}.ps1");
        try
        {
            File.WriteAllText(
                scriptPath,
                MainForm.LoadPowerShellScript(),
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

            var startInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            startInfo.ArgumentList.Add("-NoProfile");
            startInfo.ArgumentList.Add("-ExecutionPolicy");
            startInfo.ArgumentList.Add("Bypass");
            startInfo.ArgumentList.Add("-Command");
            startInfo.ArgumentList.Add("$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count -gt 0){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1};exit 0");
            startInfo.ArgumentList.Add(scriptPath);

            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Windows PowerShell self-test could not start.");
            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit();

            if (!string.IsNullOrWhiteSpace(output)) Console.Out.Write(output);
            if (!string.IsNullOrWhiteSpace(error)) Console.Error.Write(error);
            return process.ExitCode;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
        finally
        {
            try { if (File.Exists(scriptPath)) File.Delete(scriptPath); } catch { }
        }
    }
}
