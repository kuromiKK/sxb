<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { ArrowRight, GraduationCap, LockKeyhole, Pause, Play, ShieldCheck, UserRound } from 'lucide-vue-next'
import energySvg from './assets/login-energy.svg?raw'
import './styles/login.css'
import AdminLoginVerification from './AdminLoginVerification.vue'
const phone=defineModel<string>('phone',{required:true})
const password=defineModel<string>('password',{required:true})
const props=defineProps<{busy:boolean;error:string;logo:string}>()
const emit=defineEmits<{submit:[proof:string]}>()
const paused=ref(false)
const verification=ref<InstanceType<typeof AdminLoginVerification>>(),verifying=ref(false),validationError=ref(''),logoFailed=ref(false)
const busy=computed(()=>props.busy||verifying.value)
watch(()=>props.logo,()=>{logoFailed.value=false})
watch([phone,password],()=>{validationError.value='';verification.value?.cancel()})
async function submit(){
 if(busy.value)return
 validationError.value=''
 if(!/^1\d{10}$/.test(phone.value)){validationError.value='请输入11位管理员手机号';return}
 if(!password.value){validationError.value='请输入登录密码';return}
 verifying.value=true
 try{const proof=await verification.value!.verify(phone.value);emit('submit',proof)}
 catch(e:any){if(e.message!=='已取消验证')validationError.value=e.message}
 finally{verifying.value=false}
}
</script>
<template>
  <div class="login-screen">
    <div class="login-frame">
      <aside class="login-art" :class="{'is-paused':paused}" aria-label="几何能量核心主视觉">
        <div class="login-art-svg" v-html="energySvg" aria-hidden="true"></div>
        <button class="login-motion" type="button" :aria-label="paused?'播放背景动画':'暂停背景动画'" :title="paused?'播放背景动画':'暂停背景动画'" :aria-pressed="paused" @click="paused=!paused"><Play v-if="paused" :size="15" aria-hidden="true"/><Pause v-else :size="15" aria-hidden="true"/></button>
      </aside>
      <section class="login-panel">
        <header class="login-header"><img v-if="logo&&!logoFailed" class="login-brand-logo" :src="logo" alt="平台 Logo" @error="logoFailed=true"/><span v-else class="brand-icon"><GraduationCap :size="24" aria-hidden="true"/></span><strong>上行宝</strong><span>管理后台</span></header>
        <main class="login-main">
          <div class="login-eyebrow"><span></span>管理工作空间</div>
          <h1>欢迎回来</h1>
          <p>登录账号，继续今天的工作。</p>
          <el-form label-position="top" @submit.prevent="submit" :aria-busy="busy">
            <el-form-item label="管理员手机号"><el-input v-model="phone" autocomplete="username" inputmode="tel" size="large" placeholder="请输入手机号" maxlength="11" :disabled="busy" required><template #prefix><UserRound :size="18" aria-hidden="true"/></template></el-input></el-form-item>
            <el-form-item label="登录密码"><el-input v-model="password" type="password" autocomplete="current-password" show-password size="large" placeholder="请输入密码" :disabled="busy" required><template #prefix><LockKeyhole :size="18" aria-hidden="true"/></template></el-input></el-form-item>
            <el-alert v-if="validationError||error" :title="validationError||error" type="error" :closable="false" show-icon class="form-error"/>
            <el-button type="primary" native-type="submit" size="large" class="login-submit" :loading="busy"><span>登录</span><ArrowRight v-if="!busy" :size="18" aria-hidden="true"/></el-button>
          </el-form>
          <div class="login-security"><ShieldCheck :size="16" aria-hidden="true"/><span>仅限授权管理员访问</span></div>
        </main>
        <footer class="login-footer"><span>上行宝管理平台</span><span>专注内容 · 连接成长</span></footer>
      </section>
    </div>
  </div>
  <AdminLoginVerification ref="verification"/>
</template>
