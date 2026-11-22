/**
 * '물어보기' on a tool page. There are no DMs yet, so asking means a public
 * feed post addressed to the person (@handle mention + tool link). It helps
 * anyone with the same question, and the person sees it in their 팔로잉 /
 * 친구 tab if they follow you. No private channel is implied.
 * Mentions use the self-made @handle only — never a name.
 */
export function askPrompt(person: { handle: string | null; name: string }, toolName: string, toolUrl: string): string {
  const who = person.handle ? `@${person.handle}` : `${person.name}`
  return `${who} 님, ${toolName} 쓰고 계시던데 어떻게 활용하세요? 써보니 어떤지 궁금해요 🙏\n${toolUrl}`
}
