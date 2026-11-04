import { useState } from 'react';

/** Which pages hold unsaved edits, so leaving one can ask first. */
export function useUnsavedEdits() {
  const [settings, setSettings] = useState(false);
  const [report, setReport] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [advice, setAdvice] = useState(false);
  // Remounts Settings, which is how its edited fields return to the saved values.
  const [settingsKey, setSettingsKey] = useState(0);
  const discardSettings = () => {
    if (settings) setSettingsKey((current) => current + 1);
    setSettings(false);
  };
  return {
    settings,
    report,
    schedule,
    advice,
    any: settings || report || schedule || advice,
    settingsKey,
    setSettings,
    setReport,
    setSchedule,
    setAdvice,
    discardSettings,
    discardSettingsAndReport() {
      discardSettings();
      setReport(false);
    },
    discardAll() {
      discardSettings();
      setReport(false);
      setSchedule(false);
      setAdvice(false);
    },
  };
}
