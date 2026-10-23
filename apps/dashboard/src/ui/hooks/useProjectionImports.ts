import { useEffect, useState } from 'react';
import { readJsonResponse, requestResponse } from '../api-client';
import {
  isProjectionImportResult,
  isProjectionSummaryList,
  type ProjectionSummary,
} from '../memory-page-data.js';
import { confirmAction } from '../ConfirmDialog';

/** Owner-imported projection CSV sets for the Imports page. Points stay unconfirmed until marked. */
export function useProjectionImports(
  leagues: Array<{ id: string; displayName: string }>,
  active: boolean,
  setNotice: (notice: string) => void,
  setBusy: (busy: boolean) => void,
) {
  const [projectionFile, setProjectionFile] = useState<File | null>(null);
  const [projectionLeagueId, setProjectionLeagueId] = useState(leagues[0]?.id ?? '');
  const [projectionSourceName, setProjectionSourceName] = useState('');
  const [projectionSourceUrl, setProjectionSourceUrl] = useState('');
  const [projectionScoringMatched, setProjectionScoringMatched] = useState(false);
  const [projectionSets, setProjectionSets] = useState<ProjectionSummary[]>([]);
  const [projectionSetsLoading, setProjectionSetsLoading] = useState(active);
  const [projectionSetsError, setProjectionSetsError] = useState('');

  useEffect(() => {
    if (!leagues.some((league) => league.id === projectionLeagueId))
      setProjectionLeagueId(leagues[0]?.id ?? '');
  }, [leagues, projectionLeagueId]);
  useEffect(() => {
    if (active) void refreshProjectionSets();
  }, []);

  async function refreshProjectionSets() {
    setProjectionSetsLoading(true);
    setProjectionSetsError('');
    try {
      const response = await requestResponse('/api/projections');
      if (!response.ok)
        throw new Error(`Could not load imported projection sources (${response.status}).`);
      const summaries: unknown = await response.json();
      if (!isProjectionSummaryList(summaries))
        throw new Error('The local service returned an invalid projection source list.');
      setProjectionSets(summaries);
    } catch (error) {
      setProjectionSetsError(
        error instanceof Error ? error.message : 'Could not load imported projection sources.',
      );
    } finally {
      setProjectionSetsLoading(false);
    }
  }

  async function importProjections(event: React.FormEvent) {
    event.preventDefault();
    if (!projectionFile || !projectionLeagueId) return;
    const existing = projectionSets.find(
      (set) =>
        set.leagueId === projectionLeagueId &&
        set.sourceName.trim().toLowerCase() === projectionSourceName.trim().toLowerCase() &&
        (set.sourceUrl ?? '') === projectionSourceUrl.trim(),
    );
    if (
      existing &&
      !(await confirmAction('Other source sets will be kept.', {
        title: `Replace ${existing.count} projections from ${existing.sourceName}?`,
        confirmLabel: 'Replace',
      }))
    )
      return;
    setBusy(true);
    setNotice('');
    try {
      if (projectionFile.size > 250_000)
        throw new Error('Projection CSV exceeds the 250 KB import limit.');
      const csv = await projectionFile.text();
      const response = await requestResponse(
        '/api/projections/import',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            leagueId: projectionLeagueId,
            sourceName: projectionSourceName,
            sourceUrl: projectionSourceUrl,
            scoringMatched: projectionScoringMatched,
            csv,
          }),
        },
        180000,
      );
      const result = await readJsonResponse(response, isProjectionImportResult);
      setProjectionFile(null);
      setProjectionSourceName('');
      setProjectionSourceUrl('');
      setProjectionScoringMatched(false);
      setNotice(`${result.imported ?? 0} player projections saved locally for this source.`);
      await refreshProjectionSets();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import projections.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProjections(source: ProjectionSummary) {
    try {
      if (
        !(await confirmAction('Other source sets will be kept.', {
          title: `Delete ${source.count} projections from ${source.sourceName}?`,
          confirmLabel: 'Delete',
          tone: 'danger',
        }))
      )
        return;
      const response = await requestResponse(
        `/api/projections/${encodeURIComponent(source.leagueId)}/source/${encodeURIComponent(source.sourceId)}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        setNotice('Could not delete imported projections.');
        return;
      }
      setNotice('Imported projections deleted.');
      await refreshProjectionSets();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The local request failed.');
    }
  }

  return {
    projectionFile,
    setProjectionFile,
    projectionLeagueId,
    setProjectionLeagueId,
    projectionSourceName,
    setProjectionSourceName,
    projectionSourceUrl,
    setProjectionSourceUrl,
    projectionScoringMatched,
    setProjectionScoringMatched,
    projectionSets,
    projectionSetsLoading,
    projectionSetsError,
    refreshProjectionSets,
    importProjections,
    deleteProjections,
  };
}
