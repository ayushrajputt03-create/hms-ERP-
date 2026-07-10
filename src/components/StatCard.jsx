export default function StatCard({ icon: Icon, label, value, sub, color = 'teal' }) {
  return (
    <div className={`stat-card stat-card-${color}`}>
      {Icon && (
        <div className="stat-card-icon">
          <Icon size={22} />
        </div>
      )}
      <div className="stat-card-content">
        <span className="stat-card-value">{value}</span>
        <span className="stat-card-label">{label}</span>
        {sub && <span className="stat-card-sub">{sub}</span>}
      </div>
    </div>
  )
}
