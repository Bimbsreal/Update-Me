-- Fuel product enum expansion (kerosene / DPK)
-- Separate from table DDL so ADD VALUE is isolated if needed.

ALTER TYPE fuel_product_type ADD VALUE IF NOT EXISTS 'dpk';
