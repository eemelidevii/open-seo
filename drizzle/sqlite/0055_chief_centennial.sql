-- This self-hosted fork retains the legacy nullable audit detail columns.
-- v0.1.13 no longer reads or writes them, but removing them would discard
-- historical payloads and make the previous Worker incompatible with rollback.
-- Retire them only in a separately reviewed data-retention change.
SELECT 1;
