import { useState } from 'react';

interface SeatCountSettingProps {
  current: number;
  onUpdate: (count: number) => Promise<void>;
}

export function SeatCountSetting({ current, onUpdate }: SeatCountSettingProps) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (value < 1 || value === current) return;
    setSaving(true);
    await onUpdate(value);
    setSaving(false);
  }

  return (
    <div className="seat-settings">
      <h3>席数設定</h3>
      <div className="seat-settings-form">
        <input
          type="number"
          min={1}
          max={20}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <span>席</span>
        <button
          onClick={handleSave}
          disabled={saving || value === current || value < 1}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
