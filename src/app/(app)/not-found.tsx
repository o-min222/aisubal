import { NotFoundCard } from '@/components/not-found-card'

/** notFound() inside the signed-in shell: the left nav + top bar stay, the card sits in the center column. */
export default function AppNotFound() {
  return (
    <div className="py-2">
      <NotFoundCard />
    </div>
  )
}
