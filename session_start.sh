#!/bin/bash

echo "🚀 CRIOLLO VCR ENGINE - SESSION START"
echo "======================================"
echo ""
echo "📊 PROJECT STATUS:"
git log --oneline | head -3
echo ""
echo "🧪 LAST TEST RUN:"
npm test 2>&1 | grep "Tests:" | tail -1
echo ""
echo "📁 CURRENT BRANCH:"
git branch --show-current
echo ""
echo "💾 LAST COMMIT:"
git log -1 --pretty=format:"%h - %s (%ar)"
echo ""
echo ""
echo "✅ Ready to work!"
echo "📌 Current: Day 8 complete (Advanced Queries - 310 tests)"
echo "🎯 Next: Day 9 (Batch Operations)"
echo ""
echo "💡 Quick commands:"
echo "  cday     - Show current progress"
echo "  cstate   - View project state"
echo "  ccontext - View Claude context"
echo "  ctest    - Run all tests"
echo "  cquick   - Quick test check"
echo ""
