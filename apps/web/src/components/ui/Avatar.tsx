export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ name = 'User', src, size = 'sm', className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const sizeClass = size === 'sm' ? '' : size;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`av ${sizeClass} ${className}`}
        style={{ objectFit: 'cover' }}
      />
    );
  }

  return (
    <span className={`av ${sizeClass} ${className}`} title={name} aria-label={name}>
      {initials}
    </span>
  );
}
