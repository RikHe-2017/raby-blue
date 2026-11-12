<script lang="ts" setup>
  defineOptions({ inheritAttrs: false })
</script>

<template>
  <el-empty v-bind="$attrs">
    <template #image>
      <img class="common-empty__image" src="/icons/icon128.png" alt="" aria-hidden="true" />
    </template>
    <template v-if="$slots.description" #description>
      <slot name="description" />
    </template>
    <slot />
  </el-empty>
</template>
