-- Migration: Create builder_canvases table for collaborative canvas storage
-- Run this in your Supabase SQL editor

-- Create the builder_canvases table
CREATE TABLE IF NOT EXISTS public.builder_canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Canvas',
  description TEXT DEFAULT '',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  collaborators UUID[] DEFAULT '{}',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_builder_canvases_user_id ON public.builder_canvases(user_id);
CREATE INDEX IF NOT EXISTS idx_builder_canvases_updated_at ON public.builder_canvases(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_canvases_collaborators ON public.builder_canvases USING GIN(collaborators);

-- Enable Row Level Security
ALTER TABLE public.builder_canvases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view canvases they own or collaborate on
CREATE POLICY "Users can view own and collaborated canvases"
  ON public.builder_canvases
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = ANY(collaborators)
  );

-- Policy: Users can insert their own canvases
CREATE POLICY "Users can create own canvases"
  ON public.builder_canvases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update canvases they own or collaborate on
CREATE POLICY "Users can update own and collaborated canvases"
  ON public.builder_canvases
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR auth.uid() = ANY(collaborators)
  );

-- Policy: Only owners can delete canvases
CREATE POLICY "Only owners can delete canvases"
  ON public.builder_canvases
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_builder_canvas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_builder_canvases_updated_at ON public.builder_canvases;
CREATE TRIGGER update_builder_canvases_updated_at
  BEFORE UPDATE ON public.builder_canvases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_builder_canvas_updated_at();

-- Enable realtime for the table (for collaboration)
ALTER PUBLICATION supabase_realtime ADD TABLE public.builder_canvases;

-- Function to get user by email (for sharing)
CREATE OR REPLACE FUNCTION public.get_user_by_email(email_input TEXT)
RETURNS TABLE(id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email::TEXT
  FROM auth.users au
  WHERE au.email = email_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_by_email(TEXT) TO authenticated;

-- Grant permissions
GRANT ALL ON public.builder_canvases TO authenticated;
GRANT ALL ON public.builder_canvases TO service_role;
