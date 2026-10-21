import { InpatientView } from '../components/InpatientView';
import '../registration.css';

/** Front Desk → Inpatient Queue: everyone currently admitted (any admission date) and pending admissions. */
export default function InpatientQueuePage() {
  return (
    <div className="fq-page">
      <InpatientView />
    </div>
  );
}
