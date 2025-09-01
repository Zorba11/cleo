'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Project {
  id: string;
  topic: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  beats?: Beat[];
  styleBibles?: StyleBible[];
  assets?: Asset[];
  frames?: Frame[];
}

interface Beat {
  id: string;
  index: number;
  summary: string;
  onScreenText?: string;
  plannedFrames?: number;
  durationS?: number;
}

interface StyleBible {
  id: string;
  json: unknown;
}

interface Asset {
  id: string;
  type: string;
  label: string;
  r2Key: string;
}

interface Frame {
  id: string;
  beatId?: string;
  index: number;
  status: string;
  r2Key?: string;
}

interface PlanResponse {
  success: boolean;
  data?: {
    planResponse: {
      dialogueInputs: unknown[];
      beats: unknown[];
      styleBibleMin: unknown;
      timelineSkeleton: unknown;
    };
    storage: {
      projectPlanKey: string;
      styleBibleKey: string;
    };
    metadata: {
      totalDuration: number;
      beatCount: number;
      dialogueCount: number;
    };
  };
  error?: string;
}

interface NarrationResponse {
  success: boolean;
  data?: {
    projectId: string;
    dialogueIndex?: number;
    audio?: {
      key: string;
      url: string;
      duration?: number;
    };
    voiceId: string;
    status: string;
    audioResults?: Record<
      string,
      { key: string; url: string; duration?: number }
    >;
    metadata?: {
      totalDialogues: number;
      successfulGenerations: number;
      generatedAt: string;
    };
  };
  error?: string;
}

interface NarrationData {
  projectId: string;
  status: string;
  totalDialogues: number;
  narratedDialogues: number;
  audioFiles: {
    id: string;
    dialogueIndex?: number;
    filename: string;
    r2Key: string;
    duration?: number;
    voiceId?: string;
    bytes: number;
    createdAt: string;
  }[];
  beats: {
    id: string;
    index: number;
    summary: string;
    onScreenText?: string;
    durationS?: number;
    hasAudio: boolean;
    audioFile?: string;
  }[];
}

// Enhancement type removed — dialogues are generated expressive in plan

const statusLabels = {
  PLANNED: 'Planned',
  NARRATED: 'Narrated',
  ALIGNED: 'Aligned',
  CUES_READY: 'Cues Ready',
  FRAMES_READY: 'Frames Ready',
  ASSEMBLED: 'Assembled',
};

const statusColors = {
  PLANNED: 'bg-blue-100 text-blue-800',
  NARRATED: 'bg-yellow-100 text-yellow-800',
  ALIGNED: 'bg-orange-100 text-orange-800',
  CUES_READY: 'bg-purple-100 text-purple-800',
  FRAMES_READY: 'bg-pink-100 text-pink-800',
  ASSEMBLED: 'bg-green-100 text-green-800',
};

export default function ProjectDetailClient({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);
  const [fullPlan, setFullPlan] = useState<unknown | null>(null);
  const [fullPlanLoading, setFullPlanLoading] = useState(false);
  const [framesBusy, setFramesBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(true);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationResult, setNarrationResult] =
    useState<NarrationResponse | null>(null);
  const [narrationData, setNarrationData] = useState<NarrationData | null>(
    null
  );
  // Enhancement preview removed; dialogues are now generated expressive in plan

  const { user } = useUser();

  useEffect(() => {
    const fetchProject = async () => {
      if (!user) return;

      try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
          throw new Error('Project not found');
        }
        const data = await response.json();
        setProject(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [user, projectId]);

  const handleGeneratePlan = async () => {
    if (!project) return;

    setPlanLoading(true);
    setPlanResult(null);

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          topic: project.topic,
        }),
      });

      const result = await response.json();
      setPlanResult(result);

      if (result.success) {
        // Refresh project data to show updated status
        const projectResponse = await fetch(`/api/projects/${projectId}`);
        if (projectResponse.ok) {
          const projectData = await projectResponse.json();
          setProject(projectData.data);
        }
      }

      // Keep planResult state even after project refresh
    } catch (err) {
      setPlanResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to generate plan',
      });
    } finally {
      setPlanLoading(false);
    }
  };

  const handleViewFullPlan = async () => {
    setFullPlanLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan`);
      const data = await res.json();
      if (res.ok && data.success) {
        setFullPlan(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch plan');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch plan');
    } finally {
      setFullPlanLoading(false);
    }
  };

  const handleCreateFrames = async () => {
    setFramesBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/frames`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create frames');
      }
      // Refresh project to include frames
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const refreshed = await response.json();
        setProject(refreshed.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create frames');
    } finally {
      setFramesBusy(false);
    }
  };

  const handleGenerateNarration = async () => {
    if (!project) return;

    setNarrationLoading(true);
    setNarrationResult(null);

    try {
      const response = await fetch('/api/narration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
        }),
      });

      const result = await response.json();
      setNarrationResult(result);

      if (result.success) {
        // Refresh project data to show updated status
        const projectResponse = await fetch(`/api/projects/${projectId}`);
        if (projectResponse.ok) {
          const projectData = await projectResponse.json();
          setProject(projectData.data);
        }

        // Refresh narration data
        fetchNarrationData();
      }
    } catch (err) {
      setNarrationResult({
        success: false,
        error:
          err instanceof Error ? err.message : 'Failed to generate narration',
      });
    } finally {
      setNarrationLoading(false);
    }
  };

  const fetchNarrationData = useCallback(async () => {
    if (!project) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/narration`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNarrationData(data.data);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch narration data:', err);
    }
  }, [project, projectId]);

  // Fetch narration data when project status is NARRATED or higher
  useEffect(() => {
    if (
      project &&
      [
        'NARRATED',
        'ALIGNED',
        'CUES_READY',
        'FRAMES_READY',
        'ASSEMBLED',
      ].includes(project.status)
    ) {
      fetchNarrationData();
    }
  }, [project, projectId, fetchNarrationData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Project not found</h2>
        <p className="mt-2 text-gray-600">
          {error || 'The project you are looking for does not exist.'}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {project.topic}
            </h1>
            <p className="mt-2 text-gray-600">
              Created {formatDistanceToNow(new Date(project.createdAt))} ago
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              statusColors[project.status as keyof typeof statusColors]
            }`}
          >
            {statusLabels[project.status as keyof typeof statusLabels]}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-8 bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Project Actions
        </h2>

        {/* Generate Plan Section */}
        <div className="border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-medium text-gray-900">AI Planning</h3>
              <p className="text-sm text-gray-600">
                Generate a comprehensive video plan using GPT-5
              </p>
            </div>
            <button
              onClick={handleGeneratePlan}
              disabled={planLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {planLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Generating Plan...
                </>
              ) : (
                'Generate Plan with GPT-5'
              )}
            </button>
          </div>

          {/* Plan Result */}
          {planResult && (
            <div
              className={`mt-4 p-4 rounded-lg ${
                planResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              {planResult.success ? (
                <div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-green-400 mr-2"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4 className="text-sm font-medium text-green-800">
                      Plan Generated Successfully!
                    </h4>
                  </div>
                  {planResult.data && (
                    <div className="mt-2 text-sm text-green-700">
                      <p>
                        ✅ Project plan uploaded to:{' '}
                        {planResult.data.storage.projectPlanKey}
                      </p>
                      <p>
                        ✅ Style bible uploaded to:{' '}
                        {planResult.data.storage.styleBibleKey}
                      </p>
                      <p>✅ Project status updated to PLANNED</p>
                      <p className="mt-2">
                        <strong>Dialogue Turns:</strong>{' '}
                        {planResult.data.planResponse.dialogueInputs?.length ||
                          0}
                      </p>
                      <p>
                        <strong>Visual Beats:</strong>{' '}
                        {planResult.data.planResponse.beats?.length || 0}
                      </p>
                      <p>
                        <strong>Total Duration:</strong>{' '}
                        {planResult.data.metadata.totalDuration || 0}s
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-red-400 mr-2"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4 className="text-sm font-medium text-red-800">
                      Plan Generation Failed
                    </h4>
                  </div>
                  <p className="mt-2 text-sm text-red-700">
                    {planResult.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Narration Section */}
        {project.status === 'PLANNED' &&
          project.beats &&
          project.beats.length > 0 && (
            <div className="border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-md font-medium text-gray-900">
                    🎵 AI Narration
                  </h3>
                  <p className="text-sm text-gray-600">
                    Generate professional voice narration using ElevenLabs TTS
                  </p>
                </div>
                <button
                  onClick={handleGenerateNarration}
                  disabled={narrationLoading || project.status !== 'PLANNED'}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {narrationLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Generating Narration...
                    </>
                  ) : (
                    'Generate Narration with ElevenLabs'
                  )}
                </button>
              </div>

              {/* Narration Result */}
              {narrationResult && (
                <div
                  className={`mt-4 p-4 rounded-lg ${
                    narrationResult.success
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-red-50 border border-red-200'
                  }`}
                >
                  {narrationResult.success ? (
                    <div>
                      <div className="flex items-center">
                        <svg
                          className="h-5 w-5 text-green-400 mr-2"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <h4 className="text-sm font-medium text-green-800">
                          Narration Generated Successfully!
                        </h4>
                      </div>
                      {narrationResult.data && (
                        <div className="mt-2 text-sm text-green-700">
                          <p>✅ Project status updated to NARRATED</p>
                          <p>
                            <strong>Audio Files Generated:</strong>{' '}
                            {narrationResult.data.audioResults
                              ? Object.keys(narrationResult.data.audioResults)
                                  .length
                              : 0}
                          </p>
                          {narrationResult.data.metadata && (
                            <div className="mt-1">
                              <p>
                                <strong>Total Dialogues:</strong>{' '}
                                {narrationResult.data.metadata.totalDialogues}
                              </p>
                              <p>
                                <strong>Successful Generations:</strong>{' '}
                                {
                                  narrationResult.data.metadata
                                    .successfulGenerations
                                }
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center">
                        <svg
                          className="h-5 w-5 text-red-400 mr-2"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <h4 className="text-sm font-medium text-red-800">
                          Narration Generation Failed
                        </h4>
                      </div>
                      <p className="mt-2 text-sm text-red-700">
                        {narrationResult.error}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </div>

      {/* Narration Details */}
      {narrationData &&
        narrationData.audioFiles &&
        narrationData.audioFiles.length > 0 && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              🎵 Narration Details
            </h2>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div className="flex items-center mb-2">
                <svg
                  className="h-5 w-5 text-purple-400 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z"
                    clipRule="evenodd"
                  />
                </svg>
                <h3 className="text-sm font-medium text-purple-800">
                  Narration Generated
                </h3>
              </div>
              <div className="text-sm text-purple-700">
                <p>
                  <strong>Audio Files:</strong>{' '}
                  {narrationData.audioFiles.length}
                </p>
                <p>
                  <strong>Voice Used:</strong>{' '}
                  {narrationData.audioFiles[0]?.voiceId || 'Default'}
                </p>
                <p>
                  <strong>Total Duration:</strong>{' '}
                  {narrationData.audioFiles.reduce(
                    (sum: number, file) => sum + (file.duration || 0),
                    0
                  )}
                  s
                </p>
              </div>
            </div>

            {/* Dialogues are already generated expressive via plan; no enhancement preview */}

            <div className="space-y-3">
              <h3 className="text-md font-medium text-gray-900">
                🎵 Audio Files
              </h3>
              {narrationData.audioFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                >
                  <div>
                    <p className="font-medium text-gray-900">{file.filename}</p>
                    <p className="text-xs text-gray-500">
                      Dialogue {file.dialogueIndex} • {file.duration || 0}s •{' '}
                      {file.bytes} bytes
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {'downloadUrl' in file && file.downloadUrl ? (
                      <audio
                        controls
                        src={(file as any).downloadUrl}
                        className="h-8"
                      >
                        Your browser does not support the audio element.
                      </audio>
                    ) : (
                      <button
                        className="text-purple-600 hover:text-purple-800 text-sm underline"
                        onClick={() =>
                          window.open(`/api/projects/${projectId}/narration`)
                        }
                      >
                        ▶️ Play
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Existing Plan Details */}
      {project.status === 'PLANNED' &&
        project.beats &&
        project.beats.length > 0 && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                Plan Details
              </h2>
              <button
                onClick={() => setPlanOpen((v) => !v)}
                aria-expanded={planOpen}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
              >
                {planOpen ? 'Hide' : 'Show'}
              </button>
            </div>

            {planOpen && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <svg
                    className="h-5 w-5 text-green-400 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <h3 className="text-sm font-medium text-green-800">
                    Plan Generated
                  </h3>
                </div>
                <div className="text-sm text-green-700">
                  <p>
                    <strong>Visual Beats:</strong> {project.beats.length} beats
                  </p>
                  <p>
                    <strong>Total Duration:</strong>{' '}
                    {project.beats.reduce(
                      (sum, beat) => sum + (beat.durationS || 0),
                      0
                    )}
                    s
                  </p>
                  <p>
                    <strong>Planned Frames:</strong>{' '}
                    {project.beats.reduce(
                      (sum, beat) => sum + (beat.plannedFrames || 0),
                      0
                    )}{' '}
                    total
                  </p>
                  <button
                    onClick={handleViewFullPlan}
                    className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:bg-gray-400"
                    disabled={fullPlanLoading}
                  >
                    {fullPlanLoading ? 'Loading Plan…' : 'View Full Plan JSON'}
                  </button>
                  <button
                    onClick={handleCreateFrames}
                    className="mt-3 ml-2 inline-flex items-center px-3 py-1.5 rounded-md bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:bg-gray-400"
                    disabled={framesBusy}
                  >
                    {framesBusy ? 'Creating Frames…' : 'Materialize Frames'}
                  </button>
                </div>
              </div>
            )}

            {planOpen && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-gray-900 mb-3">
                  Visual Beats
                </h3>
                <div className="space-y-3">
                  {project.beats.map((beat) => (
                    <div
                      key={beat.id}
                      className="border rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">
                          Beat {beat.index}
                        </h4>
                        <span className="text-sm text-gray-500">
                          {beat.durationS}s
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">
                        {beat.summary}
                      </p>
                      {beat.onScreenText && (
                        <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          📝 {beat.onScreenText}
                        </p>
                      )}
                      {beat.plannedFrames && (
                        <p className="text-xs text-purple-600 mt-1">
                          🎬 {beat.plannedFrames} frames planned
                        </p>
                      )}
                      {project.frames && project.frames.length > 0 && (
                        <div className="mt-2 grid grid-cols-6 gap-2">
                          {project.frames
                            .filter((f) => f.beatId === beat.id)
                            .map((f) => (
                              <div
                                key={f.id}
                                className="h-10 bg-white border rounded flex items-center justify-center text-[10px] text-gray-500"
                              >
                                F{f.index}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {planOpen && fullPlan && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-gray-900 mb-3">
                  Full Plan
                </h3>
                <pre className="text-xs bg-gray-900 text-green-200 p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(fullPlan, null, 2)}
                </pre>
              </div>
            )}

            {planOpen &&
              project.styleBibles &&
              project.styleBibles.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">
                    Style Bible
                  </h3>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    {(() => {
                      const styleBible = project.styleBibles[0].json;
                      return (
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-medium text-gray-900">
                              Visual Style
                            </h4>
                            <p className="text-sm text-gray-700">
                              {styleBible.visualStyle}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              Color Palette
                            </h4>
                            <div className="flex space-x-2 mt-1">
                              {styleBible.colorPalette?.map(
                                (color: string, index: number) => (
                                  <div
                                    key={index}
                                    className="flex items-center space-x-1"
                                  >
                                    <div
                                      className="w-4 h-4 rounded border"
                                      style={{ backgroundColor: color }}
                                    ></div>
                                    <span className="text-xs text-gray-600">
                                      {color}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              Typography
                            </h4>
                            <p className="text-sm text-gray-700">
                              {styleBible.typography}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Mood</h4>
                            <p className="text-sm text-gray-700">
                              {styleBible.mood}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

            {planOpen && project.assets && project.assets.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-3">
                  Plan Files
                </h3>
                <div className="space-y-2">
                  {project.assets
                    .filter((asset) => asset.type === 'DOC')
                    .map((asset) => {
                      const isPlan =
                        asset.label === 'ProjectPlan.json' ||
                        asset.r2Key.endsWith('/plan/ProjectPlan.json');
                      const isStyle =
                        asset.label === 'StyleBible.min.json' ||
                        asset.r2Key.endsWith('/plan/StyleBible.min.json');
                      const meta = (
                        asset as unknown as { meta?: { active?: boolean } }
                      ).meta as { active?: boolean } | undefined;
                      const active = meta?.active === true;
                      return (
                        <div
                          key={asset.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {asset.label}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              {asset.r2Key}
                            </p>
                            <p
                              className={`mt-1 text-xs ${
                                active ? 'text-green-700' : 'text-gray-500'
                              }`}
                            >
                              {active ? 'Active' : 'Inactive'}
                              {isPlan
                                ? ' (Plan)'
                                : isStyle
                                ? ' (Style Bible)'
                                : ''}
                            </p>
                          </div>

                          {(isPlan || isStyle) && !active && (
                            <button
                              onClick={async () => {
                                try {
                                  await fetch(
                                    `/api/projects/${projectId}/plan`,
                                    {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        planAssetId: isPlan
                                          ? asset.id
                                          : undefined,
                                        styleAssetId: isStyle
                                          ? asset.id
                                          : undefined,
                                      }),
                                    }
                                  );
                                  const res = await fetch(
                                    `/api/projects/${projectId}`
                                  );
                                  if (res.ok) {
                                    const data = await res.json();
                                    setProject(data.data);
                                  }
                                } catch (e) {
                                  console.warn(
                                    'Failed to set active plan/style:',
                                    e
                                  );
                                }
                              }}
                              className="inline-flex items-center px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Project Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Project Information
        </h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Topic</dt>
            <dd className="mt-1 text-sm text-gray-900">{project.topic}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  statusColors[project.status as keyof typeof statusColors]
                }`}
              >
                {statusLabels[project.status as keyof typeof statusLabels]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(project.createdAt).toLocaleDateString()} at{' '}
              {new Date(project.createdAt).toLocaleTimeString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(project.updatedAt).toLocaleDateString()} at{' '}
              {new Date(project.updatedAt).toLocaleTimeString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Project ID</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">
              {project.id}
            </dd>
          </div>
        </dl>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Link
          href="/dashboard"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
