-- Retain nullable legacy audit detail columns for historical data and rollback,
-- matching this fork's SQLite upgrade. v0.1.13 does not read or write them.
-- Retire them only in a separately reviewed data-retention change.
SELECT 1;
