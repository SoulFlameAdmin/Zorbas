# Zorbas Bridge by SoulFlame

Windows bridge between the Zorbas web system, Supabase print jobs and the restaurant's installed Windows thermal printers.

## First run

1. Install `Zorbas-Bridge-Setup.exe` on the restaurant computer.
2. Open **Zorbas Bridge**.
3. Enter the restaurant code. For the pilot: `sf-zorbas`.
4. Choose the installed Windows printer for:
   - **Print 1** — waiter / staff receipt.
   - **Print 2** — kitchen receipt.
5. Run both test-print buttons.
6. Keep **Test without printing** until the physical tests are complete.
7. Switch to **Parallel test** only during an agreed test window.
8. Switch to **SoulFlame system** after the pilot is approved.

## Safety modes

- `legacy` — the Bridge does not claim new jobs. The old system remains active.
- `test_no_print` — pairing, heartbeat and printer tests work, but the queue is not consumed.
- `parallel` — the Bridge claims and prints SoulFlame jobs while the old system may remain available.
- `soulflame` — the SoulFlame print queue is active.

The red **Return old system** button switches the restaurant to `legacy`. It does not delete orders, jobs, the old EXE or the old SQL system.

## Security

- The Supabase publishable key is not a privileged service key.
- Pairing creates a random device token.
- The device token is protected with Windows DPAPI for the current Windows user.
- A Bridge can claim jobs only for its paired restaurant.
- Atomic database claims prevent two devices from taking the same print job.

## Print confirmation

Version 1.0 marks a job as printed after Windows accepts it into the local print spooler. A basic thermal printer may not provide a reliable physical-paper confirmation.

## Build

The GitHub Actions workflow publishes a self-contained Windows x64 single-file executable and builds the Inno Setup installer.

```powershell
dotnet publish .\bridge\ZorbasBridge\ZorbasBridge.csproj `
  -c Release -r win-x64 --self-contained true `
  -o .\bridge\artifacts\win-x64
```
