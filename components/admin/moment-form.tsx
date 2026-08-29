import type { Moment } from "@/lib/types";

type MomentFormProps = {
  action: string;
  moment?: Moment;
  submitLabel: string;
};

export function MomentForm({ action, moment, submitLabel }: MomentFormProps) {
  return (
    <form className="admin-form" action={action} method="post">
      <div className="admin-field-grid">
        <div className="admin-field">
          <label className="admin-label" htmlFor="date">日期</label>
          <input
            className="admin-input"
            id="date"
            name="date"
            type="date"
            defaultValue={moment?.date}
            required
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="location">地点</label>
          <input
            className="admin-input"
            id="location"
            name="location"
            type="text"
            defaultValue={moment?.location ?? ""}
            maxLength={160}
          />
        </div>
        <div className="admin-field admin-field--full">
          <label className="admin-label" htmlFor="title">标题</label>
          <input
            className="admin-input"
            id="title"
            name="title"
            type="text"
            defaultValue={moment?.title ?? ""}
            maxLength={160}
          />
        </div>
        <div className="admin-field admin-field--full">
          <label className="admin-label" htmlFor="caption">说明</label>
          <textarea
            className="admin-textarea"
            id="caption"
            name="caption"
            defaultValue={moment?.caption ?? ""}
            maxLength={10_000}
          />
        </div>
      </div>
      <div className="admin-form-actions">
        <button className="admin-button admin-button--primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
