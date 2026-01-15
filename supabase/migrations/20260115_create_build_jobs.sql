-- Migration: Create build_jobs table for MVP build orchestration
-- This tracks the status of MVP builds initiated from the builder canvas

-- Build status enum
CREATE TYPE public.build_status AS ENUM (
  'queued',
  'analyzing',
  'building',
  'complete',
  'failed',
  'cancelled'
);

-- Create the build_jobs table
CREATE TABLE IF NOT EXISTS public.build_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES public.builder_canvases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Build status tracking
  status public.build_status NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Frozen canvas snapshot at time of build
  canvas_snapshot JSONB NOT NULL, -- { nodes, edges, settings, name }

  -- Build configuration
  config JSONB DEFAULT '{}'::jsonb, -- { model, provider, options }

  -- Backboard.io integration
  backboard_assistant_id TEXT,
  backboard_thread_id TEXT,

  -- Build logs and artifacts
  logs JSONB DEFAULT '[]'::jsonb, -- Array of { timestamp, level, message }
  artifacts JSONB DEFAULT '{}'::jsonb, -- { files: [{ path, content, language }], preview_url }

  -- Error handling
  error_message TEXT,
  error_details JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_build_jobs_canvas_id ON public.build_jobs(canvas_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_user_id ON public.build_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_status ON public.build_jobs(status);
CREATE INDEX IF NOT EXISTS idx_build_jobs_created_at ON public.build_jobs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view build jobs for canvases they own or collaborate on
CREATE POLICY "Users can view related build jobs"
  ON public.build_jobs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.builder_canvases bc
      WHERE bc.id = canvas_id
      AND (bc.user_id = auth.uid() OR auth.uid() = ANY(bc.collaborators))
    )
  );

-- Policy: Users can create build jobs for their canvases
CREATE POLICY "Users can create build jobs for own canvases"
  ON public.build_jobs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.builder_canvases bc
      WHERE bc.id = canvas_id
      AND (bc.user_id = auth.uid() OR auth.uid() = ANY(bc.collaborators))
    )
  );

-- Policy: Only job owners can update their build jobs
CREATE POLICY "Users can update own build jobs"
  ON public.build_jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Only job owners can delete their build jobs
CREATE POLICY "Users can delete own build jobs"
  ON public.build_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_build_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_build_jobs_updated_at ON public.build_jobs;
CREATE TRIGGER update_build_jobs_updated_at
  BEFORE UPDATE ON public.build_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_build_jobs_updated_at();

-- Enable realtime for build status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.build_jobs;

-- Grant permissions
GRANT ALL ON public.build_jobs TO authenticated;
GRANT ALL ON public.build_jobs TO service_role;

-- Add build_status type to database types
COMMENT ON TYPE public.build_status IS 'Status enum for MVP build jobs';
COMMENT ON TABLE public.build_jobs IS 'Tracks MVP build orchestration jobs with Backboard.io integration';
