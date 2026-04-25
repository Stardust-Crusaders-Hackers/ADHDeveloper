package com.example.mcpassistant.ui

import javax.swing.Timer
import kotlin.math.*

class AnimationEngine {

    sealed class Animation {
        abstract val avatar: AvatarComponent
        abstract var done: Boolean

        class WalkToStage(
            override val avatar: AvatarComponent,
            var progress: Float = 0f,
            val startPos: java.awt.Point,
            val endPos: java.awt.Point,
            val onComplete: () -> Unit
        ) : Animation() {
            override var done = false
        }

        class Disappear(
            override val avatar: AvatarComponent,
            val onComplete: () -> Unit
        ) : Animation() {
            override var done = false
        }

        class ReturnToSeat(
            override val avatar: AvatarComponent,
            val seatPos: java.awt.Point,
            val onComplete: () -> Unit
        ) : Animation() {
            var progress: Float = 0f
            override var done = false
        }
    }

    private val animations = mutableListOf<Animation>()
    private val idleAvatars = mutableSetOf<AvatarComponent>()
    private val timer = Timer(16) { tick() }

    fun start() { timer.start() }
    fun stop() { timer.stop() }

    fun walkToStage(
        avatar: AvatarComponent,
        startPos: java.awt.Point,
        endPos: java.awt.Point,
        onComplete: () -> Unit
    ) {
        idleAvatars.remove(avatar)
        avatar.state = AvatarComponent.State.WALKING
        animations.add(Animation.WalkToStage(avatar, startPos = startPos, endPos = endPos, onComplete = onComplete))
    }

    fun disappear(avatar: AvatarComponent, onComplete: () -> Unit) {
        idleAvatars.remove(avatar)
        animations.add(Animation.Disappear(avatar, onComplete))
    }

    fun returnToSeat(avatar: AvatarComponent, seatPos: java.awt.Point, onComplete: () -> Unit) {
        animations.add(Animation.ReturnToSeat(avatar, seatPos, onComplete))
    }

    fun trackIdle(avatar: AvatarComponent) {
        idleAvatars.add(avatar)
    }

    fun untrackIdle(avatar: AvatarComponent) {
        idleAvatars.remove(avatar)
    }

    fun cancelAnimationsFor(avatar: AvatarComponent) {
        animations.removeAll { it.avatar === avatar }
    }

    private fun tick() {
        val iter = animations.iterator()
        while (iter.hasNext()) {
            val anim = iter.next()
            when (anim) {
                is Animation.WalkToStage -> tickWalk(anim)
                is Animation.Disappear -> tickDisappear(anim)
                is Animation.ReturnToSeat -> tickReturn(anim)
            }
            anim.avatar.animFrame++
            anim.avatar.repaint()
            if (anim.done) iter.remove()
        }

        tickIdle()
    }

    private fun tickWalk(anim: Animation.WalkToStage) {
        anim.progress = min(1f, anim.progress + 0.016f)
        val t = easeInOut(anim.progress)
        val x = lerp(anim.startPos.x.toFloat(), anim.endPos.x.toFloat(), t).toInt()
        val y = lerp(anim.startPos.y.toFloat(), anim.endPos.y.toFloat(), t).toInt()
        val bob = (sin(anim.avatar.animFrame * 0.8) * 3).toInt()
        anim.avatar.bounds = java.awt.Rectangle(x, y + bob, anim.avatar.width, anim.avatar.height)
        anim.avatar.stageScale = lerp(1f, 2f, t)
        if (anim.progress >= 1f) {
            anim.avatar.state = AvatarComponent.State.ON_STAGE
            anim.done = true
            anim.onComplete()
        }
    }

    private fun tickDisappear(anim: Animation.Disappear) {
        anim.avatar.alpha = max(0f, anim.avatar.alpha - 0.033f)
        anim.avatar.repaint()
        if (anim.avatar.alpha <= 0f) {
            anim.done = true
            anim.avatar.isVisible = false
            anim.onComplete()
        }
    }

    private fun tickReturn(anim: Animation.ReturnToSeat) {
        anim.progress = min(1f, anim.progress + 0.025f)
        val t = easeInOut(anim.progress)
        anim.avatar.stageScale = lerp(2f, 1f, t)
        anim.avatar.alpha = min(1f, anim.avatar.alpha + 0.05f)
        anim.avatar.repaint()
        if (anim.progress >= 1f) {
            anim.avatar.state = AvatarComponent.State.SEATED
            anim.avatar.stageScale = 1f
            anim.avatar.isVisible = true
            anim.done = true
            idleAvatars.add(anim.avatar)
            anim.onComplete()
        }
    }

    private fun tickIdle() {
        val now = System.currentTimeMillis()
        for (avatar in idleAvatars) {
            if (avatar.state == AvatarComponent.State.SEATED && now > avatar.nextIdleAnimAt) {
                val pick = if (Math.random() < 0.5)
                    AvatarComponent.State.SEATED_SCRATCH
                else
                    AvatarComponent.State.SEATED_LOOK_AROUND
                avatar.state = pick
                // Single-shot timer: return to SEATED after animation completes
                Timer(600) {
                    avatar.state = AvatarComponent.State.SEATED
                    avatar.nextIdleAnimAt = System.currentTimeMillis() + AvatarComponent.randomIdleDelay()
                }.apply { isRepeats = false; start() }
            }
            avatar.animFrame++
            avatar.repaint()
        }
    }

    private fun easeInOut(t: Float): Float = 3 * t * t - 2 * t * t * t
    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
}
