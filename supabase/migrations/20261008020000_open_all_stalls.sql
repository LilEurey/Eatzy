-- Open every stall so the whole catalog can be checked in the app.
update public.vendors set is_open = true where is_open is distinct from true;
