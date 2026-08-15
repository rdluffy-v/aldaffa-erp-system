import React, { useState } from 'react';

const DateTimePicker = ({ value, onChange, onClose }) => {
  const date = new Date(value);

  const [year, setYear] = useState(date.getFullYear());
  const [month, setMonth] = useState(date.getMonth() + 1);
  const [day, setDay] = useState(date.getDate());
  const [hour, setHour] = useState(date.getHours());
  const [minute, setMinute] = useState(date.getMinutes());

  const handleConfirm = () => {
    const newDate = new Date(year, month - 1, day, hour, minute);
    onChange(newDate.toISOString());
    onClose();
  };

  const setNow = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setDay(now.getDate());
    setHour(now.getHours());
    setMinute(now.getMinutes());
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
      <div className="glass-card p-6 w-[500px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gold">تحديد التاريخ والوقت</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Date */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">التاريخ:</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                placeholder="اليوم"
                value={day}
                onChange={(e) => setDay(parseInt(e.target.value) || 1)}
                className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 text-center"
                min="1"
                max="31"
              />
              <input
                type="number"
                placeholder="الشهر"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value) || 1)}
                className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 text-center"
                min="1"
                max="12"
              />
              <input
                type="number"
                placeholder="السنة"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || 2026)}
                className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 text-center"
                min="2020"
                max="2030"
              />
            </div>
          </div>

          {/* Time */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">الوقت:</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="الساعة"
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value) || 0)}
                className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 text-center"
                min="0"
                max="23"
              />
              <input
                type="number"
                placeholder="الدقيقة"
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value) || 0)}
                className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 text-center"
                min="0"
                max="59"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-800 p-3 rounded-lg text-center">
            <span className="text-gray-400">التاريخ المحدد: </span>
            <span className="font-bold text-gold">
              {new Date(year, month - 1, day, hour, minute).toLocaleString('ar-SD')}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={setNow}
            className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-blue-700"
          >
            🕐 الآن
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 btn-gold py-3"
          >
            ✅ تأكيد
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

export default DateTimePicker;
