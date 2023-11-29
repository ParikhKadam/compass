import React from 'react';
import Aggregations from './components/aggregations';
import { ConfirmationModalArea } from '@mongodb-js/compass-components';
import { usePreference } from 'compass-preferences-model';

export function AggregationsPlugin() {
  const showExportButton = usePreference('enableImportExport', React);
  const showRunButton = usePreference(
    'enableAggregationBuilderRunPipeline',
    React
  );
  const showExplainButton = usePreference('enableExplainPlan', React);

  return (
    <ConfirmationModalArea>
      <Aggregations
        showExportButton={showExportButton}
        showRunButton={showRunButton}
        showExplainButton={showExplainButton}
      />
    </ConfirmationModalArea>
  );
}