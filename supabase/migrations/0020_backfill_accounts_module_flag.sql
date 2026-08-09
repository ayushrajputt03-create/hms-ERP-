-- Turn the accounts module on for facilities created before it existed.
--
-- FACILITY_TYPE_MODULES now seeds `accounts: true` for every facility type,
-- but that only affects facilities created from here on. Existing configs have
-- no `accounts` key at all, and isModuleEnabled() reads a missing key as off:
--
--   return facilityConfig.modules[moduleName] === true
--
-- Their ledger is already being written — the billing trigger posts a voucher
-- on every settled invoice regardless of any module flag. Without this they
-- accrue books nobody can open.
--
-- Only fills the gap. A facility that has deliberately set accounts to false
-- keeps that choice.

update public.documents
   set data = jsonb_set(data, '{modules,accounts}', 'true'::jsonb, true),
       updated_at = now()
 where path like 'facilities/%/config'
   and data ? 'modules'
   and not (data -> 'modules' ? 'accounts');
