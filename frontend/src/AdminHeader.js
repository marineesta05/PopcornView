import React from 'react';

export default function AdminHeader({ title = 'Admin' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#131a20', color: '#fff' }}>
      <div style={{ fontWeight: 'bold', fontSize: 18 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { window.location.href = '/admin'; }} style={{ background: '#fff', color: '#131a20', border: 'none', padding: '8px 12px', borderRadius: 4, cursor: 'pointer' }}>Accueil admin</button>
      </div>
    </div>
  );
}

AdminHeader.propTypes = {
  title: React.PropTypes.string,
};
