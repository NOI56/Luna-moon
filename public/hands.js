// Hand SVG images for Rock Paper Scissors game
// These are embedded as base64 data URIs for easy use

export const HAND_IMAGES = {
  rock: `data:image/svg+xml;base64,${btoa(`
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Hand forming a fist (rock) -->
  <ellipse cx="100" cy="100" rx="60" ry="80" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Thumb -->
  <ellipse cx="60" cy="80" rx="20" ry="30" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Fingers (closed) -->
  <rect x="85" y="50" width="30" height="50" rx="15" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="95" y="50" width="30" height="50" rx="15" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="105" y="50" width="30" height="50" rx="15" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="115" y="50" width="30" height="50" rx="15" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
</svg>
  `.trim())}`,
  
  paper: `data:image/svg+xml;base64,${btoa(`
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Hand with open palm (paper) -->
  <ellipse cx="100" cy="120" rx="70" ry="60" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Fingers (open) -->
  <rect x="50" y="30" width="25" height="80" rx="12" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="70" y="30" width="25" height="80" rx="12" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="90" y="30" width="25" height="80" rx="12" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="110" y="30" width="25" height="80" rx="12" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Thumb -->
  <ellipse cx="60" cy="100" rx="20" ry="30" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
</svg>
  `.trim())}`,
  
  scissors: `data:image/svg+xml;base64,${btoa(`
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Hand with two fingers extended (scissors) -->
  <ellipse cx="100" cy="120" rx="60" ry="50" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Index finger (extended) -->
  <rect x="70" y="30" width="20" height="80" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Middle finger (extended) -->
  <rect x="90" y="30" width="20" height="80" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Ring finger (closed) -->
  <rect x="110" y="50" width="20" height="50" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Pinky (closed) -->
  <rect x="130" y="50" width="20" height="50" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Thumb -->
  <ellipse cx="60" cy="100" rx="20" ry="30" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
</svg>
  `.trim())}`,
  
  default: `data:image/svg+xml;base64,${btoa(`
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Default hand (wave) -->
  <ellipse cx="100" cy="100" rx="60" ry="70" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Fingers (relaxed) -->
  <rect x="60" y="50" width="20" height="60" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="80" y="50" width="20" height="60" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="100" y="50" width="20" height="60" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <rect x="120" y="50" width="20" height="60" rx="10" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
  <!-- Thumb -->
  <ellipse cx="60" cy="90" rx="20" ry="30" fill="#F4D8A8" stroke="#D4A574" stroke-width="2"/>
</svg>
  `.trim())}`
};





