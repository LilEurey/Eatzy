-- Turn every dish on so the whole catalog can be checked in the app.
update public.menu_items set is_available = true where is_available is distinct from true;
