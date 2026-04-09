interface StatCardProps {
  title: string
  value: number
  icon: string
  color: 'blue' | 'green' | 'red' | 'orange'
}

const StatCard = ({ title, value, icon, color }: StatCardProps) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  }

  const iconMap: Record<string, string> = {
    computer: '💻',
    online: '🟢',
    offline: '🔴',
    alert: '⚠️',
  }

  return (
    <div className={`p-6 rounded-lg border ${colorClasses[color]} shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-3xl">{iconMap[icon] || icon}</span>
      </div>
    </div>
  )
}

export default StatCard
