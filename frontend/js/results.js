
document.addEventListener('DOMContentLoaded', () => {
  const resultsGrid = document.getElementById('results');

  const results = localStorage.getItem('searchResults');
  if (!results) {
    resultsGrid.innerHTML = '<p style="color:red;">❌ No properties found.</p>';
    return;
  }

  const properties = JSON.parse(results);
  if (!Array.isArray(properties) || properties.length === 0) {
    resultsGrid.innerHTML = '<p style="color:red;">❌ No properties found.</p>';
    return;
  }

  properties.forEach((property, index) => {
    const emojis = ['🏕️', '🛖', '🏠', '🛌', '🌲', '🌿'];
    const emoji = emojis[index % emojis.length];

    const card = document.createElement('div');
    card.className = 'property-card';

    card.innerHTML = `
      <div class="emoji-box">${emoji}</div>
      <div class="property-title">${property.title}</div>
      <div class="property-location">${property.city}, ${property.country}</div>
      <div class="property-price">₺${property.price_per_night}/night</div>
      <a href="property.html?id=${property.property_id}" class="btn-details">View Details</a>
    `;

    resultsGrid.appendChild(card);
  });
});