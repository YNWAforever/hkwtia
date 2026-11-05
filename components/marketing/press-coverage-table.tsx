import type {PressClipping} from '@/lib/media/press-clippings';

export function PressCoverageTable({
  caption,
  columns,
  rows,
}: Readonly<{
  caption: string;
  columns: Readonly<{date: string; outlet: string; article: string}>;
  rows: readonly PressClipping[];
}>) {
  return (
    <div className="press-coverage-scroll">
      <table className="press-coverage">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{columns.date}</th>
            <th scope="col">{columns.outlet}</th>
            <th scope="col">{columns.article}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.articleUrl}>
              <td className="press-date">{dateCell(row)}</td>
              <td className="press-outlet">{row.outlet}</td>
              <td>
                <a href={row.articleUrl} rel="noopener noreferrer" target="_blank">{row.title}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function dateCell(row: PressClipping) {
  if (row.dateLabel.trim() === '') return null;
  if (row.dateTime) return <time dateTime={row.dateTime}>{row.dateLabel}</time>;
  return row.dateLabel;
}
