-- Undo for Step 2. Only works while the schemas are still empty (it refuses otherwise, so nothing can be lost).
drop schema if exists rws restrict;
drop schema if exists backchannel restrict;
notify pgrst, 'reload schema';
