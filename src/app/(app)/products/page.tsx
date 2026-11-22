import { redirect } from 'next/navigation'

/** 프로덕트 merged into 툴 (0006). */
export default function ProductsRedirect() {
  redirect('/tools?category=launch')
}
