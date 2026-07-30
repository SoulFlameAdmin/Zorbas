update public.sf_restaurants
set installer_ready = true,
    installer_version = '1.1.0',
    installer_url = 'https://github.com/SoulFlameAdmin/Zorbas/releases/download/zorbas-bridge-v1.1.0/Zorbas-Bridge-Setup.exe',
    updated_at = now()
where code = 'sf-zorbas';
