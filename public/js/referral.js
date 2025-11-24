// Referral System UI Component
// Handles referral link generation and stats display

class ReferralManager {
  constructor() {
    this.wallet = null;
    this.stats = null;
    this.referralLink = null;
  }

  init(wallet) {
    this.wallet = wallet;
    if (wallet) {
      this.loadReferralData();
    }
    this.checkReferralFromURL();
  }

  async loadReferralData() {
    if (!this.wallet) {
      // Show placeholder if no wallet
      this.updateUI();
      return;
    }

    try {
      // Load referral link
      const linkResponse = await fetch(`${window.location.origin}/luna/referral/link?wallet=${this.wallet}`);
      const linkData = await linkResponse.json();
      
      if (linkData.ok) {
        this.referralLink = linkData.referralLink;
      }

      // Load stats
      const statsResponse = await fetch(`${window.location.origin}/luna/referral/stats?wallet=${this.wallet}`);
      const statsData = await statsResponse.json();
      
      if (statsData.ok) {
        this.stats = statsData.stats;
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to load referral data:', error);
    }
  }

  checkReferralFromURL() {
    // Check if there's a referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const referrer = urlParams.get('ref');
    
    if (referrer && this.wallet && referrer !== this.wallet) {
      // Register referral
      this.registerReferral(referrer);
    }
  }

  async registerReferral(referrer) {
    if (!this.wallet) return;

    try {
      const response = await fetch(`${window.location.origin}/luna/referral/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: this.wallet,
          referrer: referrer
        })
      });

      const data = await response.json();
      if (data.ok) {
        console.log('Referral registered successfully!');
        // Reload stats
        this.loadReferralData();
      } else {
        console.log('Referral registration:', data.error || data.message);
      }
    } catch (error) {
      console.error('Failed to register referral:', error);
    }
  }

  createUI() {
    // Check if already exists
    if (document.getElementById('referral-section')) {
      return;
    }
    
    // Create referral section
    const referralSection = document.createElement('div');
    referralSection.id = 'referral-section';
    referralSection.className = 'referral-section';
    referralSection.innerHTML = `
      <h2>👥 Referral Program</h2>
      <div class="referral-content">
        <div class="referral-link-section">
          <label>Your Referral Link:</label>
          <div class="referral-link-container">
            <input type="text" id="referral-link-input" readonly value="Loading...">
            <button onclick="referralManager.copyReferralLink()" class="copy-btn">📋 Copy</button>
            <button onclick="referralManager.shareReferralLink()" class="share-btn">🔗 Share</button>
          </div>
        </div>
        
        <div class="referral-stats">
          <div class="stat-card">
            <div class="stat-value" id="stat-total-referrals">0</div>
            <div class="stat-label">Total Referrals</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-total-rewards">0</div>
            <div class="stat-label">Total Rewards (Luna)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-signups">0</div>
            <div class="stat-label">Signups</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="stat-first-games">0</div>
            <div class="stat-label">First Games</div>
          </div>
        </div>

        <div class="referral-rewards">
          <h3>Reward Structure:</h3>
          <ul>
            <li>✅ <strong>100 Luna</strong> - When friend signs up</li>
            <li>✅ <strong>200 Luna</strong> - When friend plays first game</li>
            <li>✅ <strong>1000 Luna</strong> - When friend reaches Top 10</li>
          </ul>
        </div>
      </div>
    `;

    // Try to add to page - check for placeholder first
    const placeholder = document.getElementById('referral-section-placeholder');
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.replaceChild(referralSection, placeholder);
    } else {
      const gameContainer = document.querySelector('.game-container') || document.querySelector('main') || document.body;
      if (gameContainer) {
        gameContainer.appendChild(referralSection);
      }
    }
  }

  updateUI() {
    // Show placeholder if no wallet or stats
    if (!this.wallet) {
      const linkInput = document.getElementById('referral-link-input');
      if (linkInput) {
        linkInput.value = 'Connect wallet to generate referral link';
      }
      return;
    }
    
    if (!this.stats) return;

    // Update stats
    const totalReferrals = document.getElementById('stat-total-referrals');
    const totalRewards = document.getElementById('stat-total-rewards');
    const signups = document.getElementById('stat-signups');
    const firstGames = document.getElementById('stat-first-games');

    if (totalReferrals) totalReferrals.textContent = this.stats.totalReferrals || 0;
    if (totalRewards) totalRewards.textContent = (this.stats.totalRewards || 0).toLocaleString();
    if (signups) signups.textContent = this.stats.stats?.signups || 0;
    if (firstGames) firstGames.textContent = this.stats.stats?.firstGames || 0;

    // Update referral link
    const linkInput = document.getElementById('referral-link-input');
    if (linkInput && this.referralLink) {
      linkInput.value = this.referralLink;
    }
  }

  copyReferralLink() {
    const linkInput = document.getElementById('referral-link-input');
    if (linkInput && this.referralLink) {
      linkInput.select();
      document.execCommand('copy');
      
      // Show feedback
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.background = '#00ff00';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
    }
  }

  shareReferralLink() {
    if (this.referralLink && navigator.share) {
      navigator.share({
        title: 'Join Luna AI RPS Game!',
        text: 'Play Rock Paper Scissors and earn rewards!',
        url: this.referralLink
      }).catch(err => console.log('Error sharing:', err));
    } else {
      // Fallback: copy to clipboard
      this.copyReferralLink();
    }
  }
}

// Global instance
const referralManager = new ReferralManager();

