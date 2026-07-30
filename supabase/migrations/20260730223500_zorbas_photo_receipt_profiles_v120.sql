begin;

update public.zorbas_print_templates
set name = 'Zorbas 80 mm · BAR / KITCHEN / BILL',
    template_json = jsonb_build_object(
      'profile_version', 'icash-photo-match-v2',
      'paper_width_mm', 80,
      'encoding', 'windows-cyrillic-via-gdi',
      'font_family', 'Consolas',
      'profiles', jsonb_build_object(
        'bar', jsonb_build_object(
          'destination', 'staff',
          'windows_printer', 'POS-80C',
          'character_width', 42,
          'contains', 'full_order',
          'show_prices', false,
          'double_header_separator', true,
          'payment_warning', 'НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ'
        ),
        'kitchen', jsonb_build_object(
          'destination', 'kitchen',
          'windows_printer', 'kitchen',
          'endpoint', '192.168.0.98:9100',
          'character_width', 34,
          'contains', 'kitchen_items_only',
          'show_prices', false,
          'large_text', true,
          'double_header_separator', true,
          'payment_warning', 'НЕ СЕ ДЪЛЖИ ПЛАЩАНЕ'
        ),
        'bill', jsonb_build_object(
          'destination', 'staff',
          'windows_printer', 'POS-80C',
          'character_width', 42,
          'contains', 'full_order_with_prices',
          'show_prices', true,
          'non_fiscal_label', 'НЕФИСКАЛНА СМЕТКА',
          'large_total', true
        )
      )
    ),
    updated_at = now()
where code = 'kitchen_default';

update public.sf_restaurants
set installer_ready = true,
    installer_version = '1.2.0',
    installer_url = 'https://github.com/SoulFlameAdmin/Zorbas/releases/download/zorbas-bridge-v1.2.0/Zorbas-Bridge-Setup.exe',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'receipt_profile', 'icash-photo-match-v2',
      'receipt_paper_width_mm', 80,
      'bar_receipt_profile', 'icash-bar-photo-v2',
      'kitchen_receipt_profile', 'icash-kitchen-photo-v2',
      'bill_receipt_profile', 'icash-bill-photo-v2',
      'bridge_version', '1.2.0'
    ),
    updated_at = now()
where code = 'sf-zorbas';

commit;
