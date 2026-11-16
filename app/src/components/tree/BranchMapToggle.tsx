import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { IconBranchTreeOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { SessionTree } from './SessionTree.js'
import { useBranchMap } from './branchMapState.js'

/** 标题栏上的开关：只订阅 open，切换时不会带着消息列表重渲染。 */
export const BranchMapToggle = () => {
  const t = useTranslate()
  const open = useBranchMap((state) => state.open)
  return (
    <IconButton
      size="xs"
      icon={<IconBranchTreeOutline16 />}
      tooltip={open ? t('branchTreeClose') : t('branchTreeButton')}
      onClick={() => {
        useBranchMap.setState((state) => ({ open: !state.open }))
      }}
    />
  )
}

/** 面板本体：关闭时不渲染，打开时才挂载（含首次可见区域裁剪）。 */
export const BranchMapPanel = ({ session }: { session: Session }) => {
  const open = useBranchMap((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <SessionTree
      session={session}
      onClose={() => {
        useBranchMap.setState({ open: false })
      }}
    />
  )
}
