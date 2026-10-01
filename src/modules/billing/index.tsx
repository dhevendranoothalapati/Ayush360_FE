import { Route, Routes } from 'react-router-dom';
import { ComingSoon } from '@/shared/components/ComingSoon';
import { NotFound } from '@/shared/components/NotFound';

/** Billing and Discharge module, mounted at /billing/* */
export default function BillingModule() {
  return (
    <Routes>
      <Route
        index
        element={<ComingSoon title="Inpatient billing" description="Running accounts, deposits, adjustments and settlement" />}
      />
      <Route
        path="discharge"
        element={<ComingSoon title="Discharge" description="Front desk discharge readiness after doctor approval" />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
