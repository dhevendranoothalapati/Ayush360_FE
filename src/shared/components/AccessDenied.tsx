import { Icon } from './Icons';

interface AccessDeniedProps {
  title?: string;
  message?: string;
}

export function AccessDenied({
  title = 'Access not available',
  message = 'Your role does not have permission to open this page.',
}: AccessDeniedProps) {
  return (
    <div className="center-state">
      <div>
        <Icon name="lock" size={40} />
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}
