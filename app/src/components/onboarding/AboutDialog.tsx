import { useTranslate } from '../../i18n/index.js'
import { IconShieldOutline16 } from '../base/icons.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { closeAbout, useAboutDialog } from './aboutState.js'
import styles from './AboutDialog.module.css'

/** 首次使用说明：为什么有这个面板、相对官方改了什么、代价是什么 */
export const AboutDialog = () => {
  const open = useAboutDialog((state) => state.open)
  return open ? <AboutContent /> : null
}

const AboutContent = () => {
  const t = useTranslate()
  // 关掉说明之后再提示填 Key：两个弹窗不叠在一起，第一眼只看到介绍
  const close = () => {
    closeAbout()
    ensureApiKey()
  }
  const groups: { heading: string; points: string[] }[] = [
    {
      heading: t('aboutSectionWhat'),
      points: [t('aboutWhat1'), t('aboutWhat2'), t('aboutWhat3')],
    },
    {
      heading: t('aboutSectionChanged'),
      points: [
        t('aboutChange1'),
        t('aboutChange2'),
        t('aboutChange3'),
        t('aboutChange4'),
        t('aboutChange5'),
      ],
    },
    {
      heading: t('aboutSectionCost'),
      points: [t('aboutCost1'), t('aboutCost2'), t('aboutCost3')],
    },
  ]
  return (
    <Modal
      title={t('aboutTitle')}
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={close}
      footer={
        <Button variant="primary" autoFocus onClick={close}>
          {t('aboutStart')}
        </Button>
      }
    >
      <p className={styles.lead}>{t('aboutLead')}</p>
      <p className={styles.leadSub}>{t('aboutLeadSub')}</p>
      {/* 安全边界放在最前面：先讲清它碰不到什么，再讲它能干什么 */}
      <section className={styles.safe}>
        <h3 className={styles.safeHeading}>
          <span className={styles.safeIcon}>
            <IconShieldOutline16 />
          </span>
          {t('aboutSafeHeading')}
        </h3>
        <ul className={styles.safePoints}>
          <li>{t('aboutSafe1')}</li>
          <li>{t('aboutSafe2')}</li>
          <li>{t('aboutSafe3')}</li>
          <li>{t('aboutSafe4')}</li>
        </ul>
      </section>
      {groups.map((group) => (
        <section key={group.heading} className={styles.section}>
          <h3 className={styles.heading}>{group.heading}</h3>
          <ul className={styles.points}>
            {group.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className={styles.outro}>{t('aboutOutro')}</p>
      <p className={styles.signoff}>{t('aboutSignoff')}</p>
    </Modal>
  )
}
