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
      <h3>既定の席数</h3>
      <p className="seat-settings-note">
        解禁日ごとに席数を指定しない場合に使う既定値です。
      </p>
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
