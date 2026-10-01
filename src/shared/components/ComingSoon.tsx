import { Icon } from './Icons';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
      </div>
      <div className="card coming-soon">
        <span className="coming-soon-icon">
          <Icon name="tools" size={34} />
        </span>
        <h2>Coming soon</h2>
        <p>This screen is planned for a later iteration of the Ayush360 frontend.</p>
      </div>
    </>
  );
}
