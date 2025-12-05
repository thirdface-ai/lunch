import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playSplitFlapForDuration } from '../utils/sounds';

// Easter egg: Text scramble effect component (airport split-flap display style)
const ScrambleText: React.FC<{ text: string; className?: string; href?: string }> = ({ text, className = '', href }) => {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const iterationRef = useRef(0);

  const scramble = useCallback(() => {
    // Prevent overlapping animations and rapid re-triggering
    if (isAnimating || cooldown) return;
    
    iterationRef.current = 0;
    setIsAnimating(true);
    const originalText = text;
    
    // Animation interval
    const intervalMs = 47;
    // Animation runs until iterationRef >= originalText.length (including spaces)
    // Each interval increments by 1/3, so total intervals = length * 3
    const animationDuration = originalText.length * 3 * intervalMs;
    
    // The settling thunk is ~60ms long and plays at the END of soundDuration
    // We want the thunk to FINISH as the animation ends, not start
    // So offset = thunk duration (~60ms) + small buffer for feel
    const soundDuration = animationDuration - 70;
    
    // Play sound - immediate, no async
    playSplitFlapForDuration(soundDuration);
    
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(() => {
      setDisplayText(
        originalText
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iterationRef.current) {
              return originalText[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );
      
      iterationRef.current += 1 / 3;
      
      if (iterationRef.current >= originalText.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayText(originalText);
        setIsAnimating(false);
        
        // Cooldown prevents immediate re-trigger
        setCooldown(true);
        setTimeout(() => setCooldown(false), 300);
      }
    }, intervalMs);
  }, [text, isAnimating, cooldown]);

  const handleMouseEnter = () => {
    setIsHovering(true);
    scramble();
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const content = (
    <span
      className={`cursor-pointer transition-all duration-200 font-mono tracking-wider ${className}`}
      style={{
        color: isHovering ? '#FF4400' : undefined,
        textShadow: isHovering ? '0 0 8px rgba(255, 68, 0, 0.6), 0 0 20px rgba(255, 68, 0, 0.3)' : 'none',
      }}
    >
      {displayText}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="no-underline"
      >
        {content}
      </a>
    );
  }

  return (
    <span onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {content}
    </span>
  );
};

interface FooterProps {
  isDark: boolean;
}

const Footer: React.FC<FooterProps> = ({ isDark }) => {
  return (
    <footer 
      className={`
        fixed z-50 font-mono uppercase tracking-wider
        bottom-3 left-1/2 -translate-x-1/2
        sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0
        ${isDark ? 'text-dark-text-muted/50' : 'text-braun-text-muted/50'}
      `}
    >
      <div className="flex items-center gap-2 text-[9px] sm:text-[10px]">
        {/* Mobile: Inline row */}
        <a 
          href="https://www.linkedin.com/in/noahnawara/"
          target="_blank"
          rel="noopener noreferrer"
          className="sm:hidden hover:text-braun-orange transition-colors"
        >
          NOAH NAWARA
        </a>
        
        {/* Desktop: Scramble effect */}
        <span className="hidden sm:inline">
          Built by{' '}
          <ScrambleText 
            text="NOAH NAWARA" 
            href="https://www.linkedin.com/in/noahnawara/"
            className={isDark ? 'text-dark-text-muted/50' : 'text-braun-text-muted/50'} 
          />
        </span>
        
        <span className={`${isDark ? 'text-dark-text-muted/30' : 'text-braun-text-muted/30'}`}>·</span>
        
        <a 
          href="https://thirdface.com/imprint" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-braun-orange transition-colors"
        >
          Imprint
        </a>
      </div>
    </footer>
  );
};

export default Footer;
