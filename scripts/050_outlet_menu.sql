-- Outlet menu (FnB, laundry, gym) + POS orders
-- Run in Supabase SQL Editor after 049_folio_attachments.sql

CREATE TABLE IF NOT EXISTS public.outlet_menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  parent_id UUID REFERENCES public.outlet_menu_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  tag_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, department, slug)
);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_categories_org_dept
  ON public.outlet_menu_categories(organization_id, department);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_categories_parent
  ON public.outlet_menu_categories(parent_id);

CREATE TABLE IF NOT EXISTS public.outlet_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.outlet_menu_categories(id) ON DELETE SET NULL,
  department TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT 'Carefully selected for your comfort and enjoyment.',
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  sku TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  service_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_items_org_dept
  ON public.outlet_menu_items(organization_id, department);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_items_category
  ON public.outlet_menu_items(category_id);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_items_active
  ON public.outlet_menu_items(organization_id, department, is_active);

CREATE TABLE IF NOT EXISTS public.outlet_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'void')),
  order_type TEXT NOT NULL DEFAULT 'takeaway' CHECK (order_type IN ('dine_in', 'takeaway', 'room_service')),
  guest_name TEXT,
  room_number TEXT,
  table_label TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  payment_method TEXT,
  folio_charge_id UUID REFERENCES public.folio_charges(id) ON DELETE SET NULL,
  payment_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  settled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_outlet_orders_org_dept_date
  ON public.outlet_orders(organization_id, department, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outlet_orders_status
  ON public.outlet_orders(organization_id, status);

CREATE TABLE IF NOT EXISTS public.outlet_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.outlet_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.outlet_menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  qty NUMERIC(12, 3) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_outlet_order_lines_order
  ON public.outlet_order_lines(order_id);

ALTER TABLE public.outlet_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_order_lines ENABLE ROW LEVEL SECURITY;

-- Staff in same organization may read/write outlet data (app enforces role permissions)
DROP POLICY IF EXISTS outlet_menu_categories_org ON public.outlet_menu_categories;
CREATE POLICY outlet_menu_categories_org ON public.outlet_menu_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_menu_categories.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_menu_categories.organization_id
    )
  );

DROP POLICY IF EXISTS outlet_menu_items_org ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_org ON public.outlet_menu_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_menu_items.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_menu_items.organization_id
    )
  );

DROP POLICY IF EXISTS outlet_orders_org ON public.outlet_orders;
CREATE POLICY outlet_orders_org ON public.outlet_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_orders.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_orders.organization_id
    )
  );

DROP POLICY IF EXISTS outlet_order_lines_org ON public.outlet_order_lines;
CREATE POLICY outlet_order_lines_org ON public.outlet_order_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outlet_orders o
      JOIN public.profiles p ON p.organization_id = o.organization_id AND p.id = auth.uid()
      WHERE o.id = outlet_order_lines.order_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outlet_orders o
      JOIN public.profiles p ON p.organization_id = o.organization_id AND p.id = auth.uid()
      WHERE o.id = outlet_order_lines.order_id
    )
  );
