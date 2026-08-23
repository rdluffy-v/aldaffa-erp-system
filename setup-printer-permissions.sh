#!/usr/bin/env bash
# ============================================================================
# ALDAFFA ERP - LINUX THERMAL PRINTER & UDEV PERMISSION CONFIGURATOR
# ============================================================================
# Target Hardware: Xprinter XP-365B / Thermal Label & POS Printers
# Target OS: Debian / Kali Linux / Zorin OS / Ubuntu

set -e

echo "=========================================================="
echo " 🖨️  Aldaffa ERP - إعداد طابعات الباركود والملصقات الحرارية"
echo "=========================================================="

TARGET_USER="${SUDO_USER:-$USER}"

# 1. Install CUPS and printing drivers
echo "📦 [1/5] التحقق من حزم CUPS وتعريفات الطابعات..."
if ! command -v cupsd &> /dev/null; then
  echo "جاري تثبيت CUPS..."
  sudo apt-get update && sudo apt-get install -y cups cups-daemon cups-client printer-driver-all
else
  echo "✅ حزم CUPS مثبتة بالفعل."
fi

# 2. Add User to lp and lpadmin groups
echo "👤 [2/5] منح صلاحيات الطباعة والوصول المباشر للمستخدم ($TARGET_USER)..."
sudo usermod -aG lp,lpadmin,dialout "$TARGET_USER"

# 3. Create udev rule for Xprinter XP-365B and raw USB thermal devices
echo "🔌 [3/5] إنشاء قواعد udev لمنافذ USB الخاصة بالطابعة الحرارية..."
sudo tee /etc/udev/rules.d/99-xprinter.rules > /dev/null <<'EOF'
# Xprinter XP-365B & POS Thermal Label Printers
SUBSYSTEM=="usb", ATTRS{idVendor}=="1fc9", MODE="0666", GROUP="lp"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0416", MODE="0666", GROUP="lp"
SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", MODE="0666", GROUP="lp"
KERNEL=="lp*", SUBSYSTEM=="usblp", MODE="0666", GROUP="lp"
EOF

# 4. Reload udev rules
echo "🔄 [4/5] تطبيق قواعد udev..."
sudo udevadm control --reload-rules && sudo udevadm trigger

# 5. Enable and start CUPS service
echo "🚀 [5/5] تفعيل وبدء خدمة CUPS المركزية..."
sudo systemctl enable --now cups.service
sudo systemctl restart cups.service

# Enable all detected queues
if command -v cupsenable &> /dev/null; then
  for p in $(lpstat -p 2>/dev/null | awk '{print $2}'); do
    sudo cupsenable "$p" 2>/dev/null || true
    sudo cupsaccept "$p" 2>/dev/null || true
  done
fi

echo ""
echo "=========================================================="
echo " ✅ تم إعداد وتفعيل نظام الطباعة بنجاح!"
echo " الطابعة جاهزة الآن للطباعة الفورية والمباشرة بدون أي عوائق."
echo "=========================================================="
