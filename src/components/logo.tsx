import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: { width: 80, height: 24 },
  md: { width: 120, height: 36 },
  lg: { width: 160, height: 48 },
  xl: { width: 240, height: 72 },
}

export function Logo({ variant = 'dark', size = 'md', className }: LogoProps) {
  const { width, height } = sizes[size]
  const fill = variant === 'light' ? '#ffffff' : '#1a1a1a'
  
  return (
    <svg 
      viewBox="0 0 240 72" 
      width={width} 
      height={height}
      className={cn('flex-shrink-0', className)}
      aria-label="AI쓰발"
    >
      <g fill={fill} transform="translate(0, 8)">
        {/* A - stylized italic */}
        <path d="M0 56 L24 0 L40 0 L64 56 L48 56 L44 44 L20 44 L16 56 Z M24 32 L40 32 L32 12 Z" />
        
        {/* I - italic bar */}
        <path d="M68 56 L76 0 L92 0 L84 56 Z" />
        
        {/* 발 - Korean character, stylized */}
        {/* ㅂ part */}
        <path d="M100 0 L116 0 L114 12 L130 12 L132 0 L148 0 L144 24 L104 24 L100 0 Z M108 8 L110 16 L138 16 L140 8 Z" />
        
        {/* ㅏ part */}
        <path d="M152 0 L168 0 L160 56 L144 56 L152 0 Z M156 24 L188 24 L186 36 L154 36 Z" />
        
        {/* ㄹ part */}
        <path d="M104 28 L144 28 L142 36 L124 36 L122 44 L140 44 L138 52 L156 52 L154 60 L100 60 L102 52 L118 52 L120 44 L102 44 L104 36 Z" />
      </g>
    </svg>
  )
}

export function LogoMark({ variant = 'dark', size = 'md', className }: LogoProps) {
  const sizeMap = { sm: 24, md: 32, lg: 40, xl: 56 }
  const dimension = sizeMap[size]
  const fill = variant === 'light' ? '#ffffff' : '#1a1a1a'
  
  return (
    <svg 
      viewBox="0 0 48 48" 
      width={dimension} 
      height={dimension}
      className={cn('flex-shrink-0', className)}
      aria-label="AI쓰발"
    >
      <g fill={fill}>
        {/* Stylized A mark */}
        <path d="M4 44 L20 4 L28 4 L44 44 L34 44 L31 36 L17 36 L14 44 Z M19 28 L29 28 L24 14 Z" />
      </g>
    </svg>
  )
}

export function LogoWithBackground({ size = 'xl', className }: Omit<LogoProps, 'variant'>) {
  const { width, height } = sizes[size]
  const padding = 32
  
  return (
    <div 
      className={cn(
        'bg-black rounded-2xl flex items-center justify-center',
        className
      )}
      style={{ 
        width: width + padding * 2, 
        height: height + padding * 2,
        padding: padding 
      }}
    >
      <Logo variant="light" size={size} />
    </div>
  )
}
